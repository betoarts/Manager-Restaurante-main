package middleware

import (
	"errors"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

var JWTSecret = []byte("super-secret-restaurant-manager-key-2026")

// JWTCustomClaims specifies token payload
type JWTCustomClaims struct {
	UserID   uint   `json:"user_id"`
	TenantID uint   `json:"tenant_id"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// GetTenantID extracts tenant ID from Fiber context locals
func GetTenantID(c *fiber.Ctx) uint {
	val := c.Locals("tenant_id")
	if val == nil {
		return 0
	}
	if id, ok := val.(uint); ok {
		return id
	}
	return 0
}

// GetUserID extracts user ID from Fiber context locals
func GetUserID(c *fiber.Ctx) uint {
	val := c.Locals("user_id")
	if val == nil {
		return 0
	}
	if id, ok := val.(uint); ok {
		return id
	}
	return 0
}

// RequireAuth enforces JWT validation and populates tenant context
func RequireAuth(c *fiber.Ctx) error {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing authorization token"})
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid authorization header format"})
	}

	tokenStr := parts[1]
	claims := &JWTCustomClaims{}

	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return JWTSecret, nil
	})

	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid or expired token"})
	}

	// Set context values
	c.Locals("user_id", claims.UserID)
	c.Locals("tenant_id", claims.TenantID)
	c.Locals("role", claims.Role)

	return c.Next()
}

// RequireRole enforces specific RBAC roles
func RequireRole(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userRoleVal := c.Locals("role")
		if userRoleVal == nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: No role assigned"})
		}

		userRole := userRoleVal.(string)

		// Admin overrides all role requirements
		if userRole == "admin" {
			return c.Next()
		}

		for _, r := range roles {
			if r == userRole {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Insufficient privileges"})
	}
}

// TenantScope GORM Scope to enforce multi-tenant isolation
func TenantScope(tenantID uint) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if tenantID == 0 {
			db.AddError(errors.New("missing tenant_id in query scope"))
			return db
		}
		return db.Where("tenant_id = ?", tenantID)
	}
}
