# Express.js Backend Integration

This recipe shows how to integrate SawyerCore into an existing Node.js / Express backend service.

## Architecture

```
[Client App] ---> [Express Backend API] ---> [SawyerCore Runtime (:8787)] ---> [Local vLLM / llama.cpp]
```

## Running the Example

1. Ensure SawyerCore is running:
   ```bash
   cargo run -p sawyer-cli -- serve
   ```

2. Run the Express server:
   ```bash
   npx tsx examples/node-express-backend/server.ts
   ```

3. Test with cURL:
   ```bash
   curl -X POST http://127.0.0.1:3000/ai/chat \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Hello from Express"}'
   ```
