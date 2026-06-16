package handlers

import (
	"manager-restaurant/backend/internal/domain"
	"manager-restaurant/backend/pkg/database"
	"manager-restaurant/backend/pkg/middleware"

	"github.com/gofiber/fiber/v2"
)

// HandleGetPermissoes returns all permissions for the tenant
func HandleGetPermissoes(c *fiber.Ctx) error {
	tenantIDVal := c.Locals("tenant_id")
	if tenantIDVal == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	tenantID := tenantIDVal.(uint)

	db := database.GetDB()
	var permissoes []domain.RolePermission

	if err := db.Scopes(middleware.TenantScope(tenantID)).Find(&permissoes).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch permissions"})
	}

	return c.JSON(permissoes)
}

// RolePermissionUpdate represents the payload for bulk updating permissions
type RolePermissionUpdate struct {
	Role      string `json:"role"`
	Modulo    string `json:"modulo"`
	Permitido bool   `json:"permitido"`
}

// HandleSavePermissoes bulk updates permissions
func HandleSavePermissoes(c *fiber.Ctx) error {
	tenantIDVal := c.Locals("tenant_id")
	if tenantIDVal == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	tenantID := tenantIDVal.(uint)

	var updates []RolePermissionUpdate
	if err := c.BodyParser(&updates); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request payload"})
	}

	db := database.GetDB()
	tx := db.Begin()

	for _, update := range updates {
		var perm domain.RolePermission
		
		// Find existing
		err := tx.Scopes(middleware.TenantScope(tenantID)).
			Where("role = ? AND modulo = ?", update.Role, update.Modulo).
			First(&perm).Error

		if err != nil {
			// Create new if not found
			perm = domain.RolePermission{
				TenantID:  tenantID,
				Role:      update.Role,
				Modulo:    update.Modulo,
				Permitido: update.Permitido,
			}
			if err := tx.Create(&perm).Error; err != nil {
				tx.Rollback()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create permission"})
			}
		} else {
			// Update existing
			perm.Permitido = update.Permitido
			if err := tx.Save(&perm).Error; err != nil {
				tx.Rollback()
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update permission"})
			}
		}
	}

	tx.Commit()
	return c.JSON(fiber.Map{"message": "Permissions updated successfully"})
}
