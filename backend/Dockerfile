FROM golang:1.27-alpine AS builder

WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY main.go import_service.go import_service_test.go ./
RUN go test ./...
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/pocketbase .

FROM alpine:3.24

RUN apk add --no-cache ca-certificates curl

COPY --from=builder /out/pocketbase /pb/pocketbase
RUN chmod +x /pb/pocketbase

COPY pb_hooks/     /pb/pb_hooks/
COPY pb_migrations/ /pb/pb_migrations/
COPY docker-entrypoint.sh /pb/docker-entrypoint.sh
RUN chmod +x /pb/docker-entrypoint.sh

WORKDIR /pb

EXPOSE 8090

CMD ["/pb/docker-entrypoint.sh"]
