# Kubernetes Deployment Manifests

Production Kubernetes deployment patterns for running SawyerCore on edge or cloud clusters.

---

## 1. ConfigMap & Secret

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: sawyer-config
data:
  SAWYER_BIND_HOST: "0.0.0.0"
  SAWYER_PORT: "8787"
  SAWYER_MODE: "local-safe"
  SAWYER_PRIVATE_MODE: "true"
  SAWYER_CLOUD_FALLBACK: "false"
---
apiVersion: v1
kind: Secret
metadata:
  name: sawyer-secret
type: Opaque
stringData:
  SAWYER_NODE_TOKEN: "node-token-secret-change-me"
```

---

## 2. Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sawyer-core
  labels:
    app: sawyer-core
spec:
  replicas: 2
  selector:
    matchLabels:
      app: sawyer-core
  template:
    metadata:
      labels:
        app: sawyer-core
    spec:
      containers:
        - name: sawyer
          image: ghcr.io/example/sawyercore:latest
          ports:
            - containerPort: 8787
          envFrom:
            - configMapRef:
                name: sawyer-config
            - secretRef:
                name: sawyer-secret
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "2Gi"
              cpu: "2000m"
          livenessProbe:
            httpGet:
              path: /api/health
              port: 8787
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health
              port: 8787
            initialDelaySeconds: 2
            periodSeconds: 5
```

---

## 3. Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sawyer-service
spec:
  type: ClusterIP
  selector:
    app: sawyer-core
  ports:
    - protocol: TCP
      port: 8787
      targetPort: 8787
```
