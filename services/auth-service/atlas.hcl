# atlas config for auth-service migrations.
# usage:
#   atlas migrate apply --env local
# 在写新迁移后:
#   atlas migrate hash --env local

env "local" {
  url = getenv("DATABASE_URL")
  migration {
    dir = "file://migrations"
  }
  format {
    migrate {
      apply = "{{ json . }}"
    }
  }
}

env "test" {
  url = getenv("DATABASE_URL")
  migration {
    dir = "file://migrations"
  }
}
