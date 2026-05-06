docker build --build-arg VITE_BASE_PATH=/dev-ai/ -t zero123h/sub2api:dev-ai-subpath-v2 -f Dockerfile .
docker push zero123h/sub2api:dev-ai-subpath-v2


cd /opt/sub2api/deploy && docker compose pull sub2api && docker compose up -d --force-recreate sub2api && docker compose logs --tail=50 sub2ap