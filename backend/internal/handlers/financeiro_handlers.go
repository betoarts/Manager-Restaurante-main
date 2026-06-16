package handlers

import (
	"manager-restaurant/backend/internal/domain"
	"manager-restaurant/backend/pkg/database"
	"manager-restaurant/backend/pkg/middleware"

	"github.com/gofiber/fiber/v2"
)

// HandleGetExtrato returns the LancamentosFinanceiros ordered by date descending
func HandleGetExtrato(c *fiber.Ctx) error {
	tenantID := middleware.GetTenantID(c)
	db := database.GetDB()

	var lancamentos []domain.LancamentoFinanceiro
	if err := db.Scopes(middleware.TenantScope(tenantID)).
		Preload("CaixaTurno").
		Preload("ContaPagar").
		Preload("ContaPagar.Fornecedor").
		Order("data desc").
		Find(&lancamentos).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch extrato"})
	}

	return c.JSON(lancamentos)
}
