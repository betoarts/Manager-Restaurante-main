package websocket

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/redis/go-redis/v9"
)

// Client represents a connected WebSocket client
type Client struct {
	Conn     *websocket.Conn
	TenantID uint
	UserID   uint
	Send     chan []byte
}

// RealtimeMessage defines the structure of events sent over WS
type RealtimeMessage struct {
	TenantID uint            `json:"tenant_id"`
	Event    string          `json:"event"` // e.g., "order_created", "kds_updated", "table_updated"
	Data     json.RawMessage `json:"data"`
}

// Hub manages WebSocket clients and Redis pub/sub routing
type Hub struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
	redisCli   *redis.Client
}

var GlobalHub *Hub

// NewHub creates a new WebSocket Hub
func NewHub(redisCli *redis.Client) *Hub {
	GlobalHub = &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		redisCli:   redisCli,
	}
	return GlobalHub
}

// Broadcast sends a message to Redis Pub/Sub to sync across instances
func (h *Hub) Broadcast(tenantID uint, event string, data interface{}) {
	dataBytes, err := json.Marshal(data)
	if err != nil {
		log.Printf("Error marshaling broadcast data: %v", err)
		return
	}

	msg := RealtimeMessage{
		TenantID: tenantID,
		Event:    event,
		Data:     dataBytes,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Error marshaling websocket wrapper: %v", err)
		return
	}

	// Publish to Redis
	ctx := context.Background()
	err = h.redisCli.Publish(ctx, "restaurant_realtime", msgBytes).Err()
	if err != nil {
		log.Printf("Error publishing to Redis: %v", err)
	}
}

// Run starts the Hub routing loops
func (h *Hub) Run() {
	// Goroutine for local WS clients management
	go func() {
		for {
			select {
			case client := <-h.register:
				h.mu.Lock()
				h.clients[client] = true
				h.mu.Unlock()
				log.Printf("Client registered: User %d for Tenant %d", client.UserID, client.TenantID)

			case client := <-h.unregister:
				h.mu.Lock()
				if _, ok := h.clients[client]; ok {
					delete(h.clients, client)
					close(client.Send)
					client.Conn.Close()
					log.Printf("Client unregistered: User %d for Tenant %d", client.UserID, client.TenantID)
				}
				h.mu.Unlock()
			}
		}
	}()

	// Goroutine for Redis Pub/Sub subscription (with auto-reconnect)
	go func() {
		for {
			ctx := context.Background()
			pubsub := h.redisCli.Subscribe(ctx, "restaurant_realtime")
			log.Println("Subscribed to Redis Pub/Sub channel 'restaurant_realtime'")

			ch := pubsub.Channel()
			func() {
				defer pubsub.Close()
				for msg := range ch {
					var wsMsg RealtimeMessage
					err := json.Unmarshal([]byte(msg.Payload), &wsMsg)
					if err != nil {
						log.Printf("Error unmarshaling pubsub payload: %v", err)
						continue
					}

					// Broadcast locally to matching tenant clients
					h.mu.RLock()
					for client := range h.clients {
						if client.TenantID == wsMsg.TenantID {
							select {
							case client.Send <- []byte(msg.Payload):
							default:
								// Buffer full: unregister lagging client
								go func(c *Client) {
									h.unregister <- c
								}(client)
							}
						}
					}
					h.mu.RUnlock()
				}
			}()

			log.Println("Redis Pub/Sub disconnected. Reconnecting in 3 seconds...")
			time.Sleep(3 * time.Second)
		}
	}()
}

// WritePump writes messages from the Hub channel to the WS connection
func (c *Client) WritePump() {
	defer func() {
		c.Conn.Close()
	}()

	for msg := range c.Send {
		err := c.Conn.WriteMessage(websocket.TextMessage, msg)
		if err != nil {
			log.Printf("Write error for client user %d: %v", c.UserID, err)
			break
		}
	}
}

// ReadPump reads incoming messages from the WebSocket (can be used for pings/pongs)
func (c *Client) ReadPump(hub *Hub) {
	defer func() {
		hub.unregister <- c
	}()

	c.Conn.SetReadLimit(512) // Limit message size
	for {
		_, _, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Read error: %v", err)
			}
			break
		}
	}
}

// RegisterClient adds a client to register channel
func (h *Hub) RegisterClient(c *Client) {
	h.register <- c
}

// UnregisterClient adds a client to unregister channel
func (h *Hub) UnregisterClient(c *Client) {
	h.unregister <- c
}
