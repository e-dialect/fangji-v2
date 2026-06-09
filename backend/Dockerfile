FROM alpine:3.19

ARG PB_VERSION=0.21.3
ARG TARGETARCH=amd64

RUN apk add --no-cache curl unzip ca-certificates

# Download PocketBase binary for the target architecture
RUN curl -Lo /tmp/pocketbase.zip \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && unzip /tmp/pocketbase.zip -d /pb/ \
    && rm /tmp/pocketbase.zip \
    && chmod +x /pb/pocketbase

COPY pb_hooks/     /pb/pb_hooks/
COPY pb_migrations/ /pb/pb_migrations/
COPY docker-entrypoint.sh /pb/docker-entrypoint.sh
RUN sed -i 's/\r$//' /pb/docker-entrypoint.sh \
    && chmod +x /pb/docker-entrypoint.sh

WORKDIR /pb

EXPOSE 8090

CMD ["/pb/docker-entrypoint.sh"]
