# atlas migration config for script-service.
# usage:
#   atlas migrate apply --env local
# 增加新迁移后:
#   atlas migrate hash --env local

env "local" {
  url = getenv("DATABASE_URL")
  migration {
    dir = "file://migrations"
  }
}

env "test" {
  url = getenv("DATABASE_URL")
  migration {
    dir = "file://migrations"
  }
}
