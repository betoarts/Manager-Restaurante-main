package redis

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var Client *redis.Client
var Ctx = context.Background()

// ConnectRedis initializes the Redis connection
func ConnectRedis() *redis.Client {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379" // Fallback to localhost if running outside Docker
	}

	Client = redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: "", // No password by default
		DB:       0,  // Use default DB
	})

	// Retry connection for docker sync
	var err error
	for i := 0; i < 5; i++ {
		_, err = Client.Ping(Ctx).Result()
		if err == nil {
			break
		}
		log.Printf("Failed to connect to Redis. Retrying in 2 seconds... (Attempt %d/5)", i+1)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatalf("Error connecting to Redis: %v", err)
	}

	log.Println("Connected to Redis successfully.")
	return Client
}
