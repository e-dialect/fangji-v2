FROM alpine:3.19

ARG PB_VERSION=0.22.21

RUN apk add --no-cache curl unzip ca-certificates

# Download PocketBase binary
RUN curl -Lo /tmp/pocketbase.zip \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    && unzip /tmp/pocketbase.zip -d /pb/ \
    && rm /tmp/pocketbase.zip \
    && chmod +x /pb/pocketbase

COPY pb_hooks/     /pb/pb_hooks/
COPY pb_migrations/ /pb/pb_migrations/

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
