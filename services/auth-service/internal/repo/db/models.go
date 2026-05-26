// Domain models matching migrations/0001_init.sql.
// Style: sqlc-compatible. Hand-written for initial commit.

package db

import (
	"net/netip"
	"time"

	"github.com/google/uuid"
)

type UserStatus string

const (
	UserStatusActive    UserStatus = "active"
	UserStatusSuspended UserStatus = "suspended"
	UserStatusDeleted   UserStatus = "deleted"
)

type TeamRole string

const (
	TeamRoleOwner  TeamRole = "owner"
	TeamRoleAdmin  TeamRole = "admin"
	TeamRoleEditor TeamRole = "editor"
	TeamRoleViewer TeamRole = "viewer"
)

type PlanTier string

const (
	PlanFree       PlanTier = "free"
	PlanPro        PlanTier = "pro"
	PlanTeam       PlanTier = "team"
	PlanEnterprise PlanTier = "enterprise"
)

type User struct {
	ID              uuid.UUID
	Email           string
	Phone           *string
	PasswordHash    *string
	Name            string
	AvatarURL       *string
	Bio             *string
	Status          UserStatus
	TwoFactorSecret *string
	LastLoginAt     *time.Time
	EmailVerifiedAt *time.Time
	PhoneVerifiedAt *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
	DeletedAt       *time.Time
}

type Team struct {
	ID         uuid.UUID
	Name       string
	Slug       *string
	Plan       PlanTier
	SeatTotal  int16
	RenewDate  *time.Time
	AutoRenew  bool
	Metadata   []byte
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type TeamMember struct {
	ID        uuid.UUID
	TeamID    uuid.UUID
	UserID    uuid.UUID
	Role      TeamRole
	JoinedAt  time.Time
	InvitedBy *uuid.UUID
}

type RefreshToken struct {
	ID            uuid.UUID
	UserID        uuid.UUID
	TeamID        uuid.UUID
	TokenHash     string
	ParentID      *uuid.UUID
	UserAgent     *string
	IP            *netip.Addr
	DeviceID      *string
	ExpiresAt     time.Time
	RevokedAt     *time.Time
	RevokedReason *string
	CreatedAt     time.Time
}
