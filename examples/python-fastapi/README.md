# Python FastAPI Integration

This example demonstrates how to integrate the SawyerCore Python SDK into a FastAPI microservice.

## Setup & Running

1. Install requirements:
   ```bash
   pip install fastapi uvicorn
   pip install -e sdk/python
   ```

2. Run the FastAPI application:
   ```bash
   python examples/python-fastapi/app.py
   ```

3. Test endpoint:
   ```bash
   curl -X POST http://127.0.0.1:8000/chat \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Classify this sensor reading: high vibration on joint 4"}'
   ```
