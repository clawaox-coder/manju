package db

import "github.com/jackc/pgx/v5"

// 集中放 row scanners, 避免每个 query 复写一遍.

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(
		&u.ID, &u.Email, &u.Phone, &u.PasswordHash, &u.Name,
		&u.AvatarURL, &u.Bio, &u.Status, &u.TwoFactorSecret,
		&u.LastLoginAt, &u.EmailVerifiedAt, &u.PhoneVerifiedAt,
		&u.CreatedAt, &u.UpdatedAt, &u.DeletedAt,
	)
	return u, err
}

func scanTeam(row pgx.Row) (Team, error) {
	var t Team
	err := row.Scan(
		&t.ID, &t.Name, &t.Slug, &t.Plan, &t.SeatTotal,
		&t.RenewDate, &t.AutoRenew, &t.Metadata,
		&t.CreatedAt, &t.UpdatedAt,
	)
	return t, err
}

func scanRefreshToken(row pgx.Row) (RefreshToken, error) {
	var r RefreshToken
	err := row.Scan(
		&r.ID, &r.UserID, &r.TeamID, &r.TokenHash, &r.ParentID,
		&r.UserAgent, &r.IP, &r.DeviceID,
		&r.ExpiresAt, &r.RevokedAt, &r.RevokedReason, &r.CreatedAt,
	)
	return r, err
}
