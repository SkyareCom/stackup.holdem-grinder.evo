FROM rust:1.90-bookworm AS solver-builder
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN git clone --depth 1 https://github.com/exinori/DCFR-SOLVER.git
WORKDIR /build/DCFR-SOLVER
RUN cargo build --release
RUN mkdir -p /artifacts && \
    ./target/release/dcfr-solver preflop \
      --iterations 10000000 \
      --output /artifacts/preflop_blueprint.bin \
      --chart-output /artifacts/preflop_charts.json \
      --matchup-output /artifacts/matchups.json

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=solver-builder /build/DCFR-SOLVER/target/release/dcfr-solver /usr/local/bin/dcfr-solver
COPY --from=solver-builder /build/DCFR-SOLVER/LICENSE /licenses/DCFR-SOLVER-LICENSE
COPY --from=solver-builder /artifacts /opt/stackup
COPY solver-api/package.json solver-api/server.mjs ./
ENV NODE_ENV=production
ENV PORT=3000
ENV STACKUP_DCFR_BIN=/usr/local/bin/dcfr-solver
ENV STACKUP_PREFLOP_CHARTS=/opt/stackup/preflop_charts.json
ENV STACKUP_PREFLOP_MATCHUPS=/opt/stackup/matchups.json
ENV STACKUP_PREFLOP_ITERATIONS=10000000
ENV STACKUP_POSTFLOP_ITERATIONS=120
EXPOSE 3000
CMD ["node","server.mjs"]
