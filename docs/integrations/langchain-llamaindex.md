# LangChain & LlamaIndex Integration Guide

Integrate SawyerCore into Python and TypeScript AI agent frameworks using standard OpenAI-compatible wrappers.

---

## 1. LangChain (Python)

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# Configure LangChain to point at SawyerCore
llm = ChatOpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key="sawyer-local",
    model="local-qwen",
    temperature=0.0
)

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an autonomous incident response planner."),
    ("user", "{input}")
])

chain = prompt | llm
response = chain.invoke({"input": "Describe the fail-safe degraded state."})
print(response.content)
```

---

## 2. LangChain.js (TypeScript)

```typescript
import { ChatOpenAI } from '@langchain/openai';

const model = new ChatOpenAI({
  configuration: {
    baseURL: 'http://127.0.0.1:8787/v1',
    apiKey: process.env.SAWYER_API_KEY || 'sawyer-local',
  },
  modelName: 'local-qwen',
  temperature: 0,
});

const response = await model.invoke('What is deterministic scheduling?');
console.log(response.content);
```

---

## 3. LlamaIndex (Python)

```python
from llama_index.llms.openai_like import OpenAILike

llm = OpenAILike(
    api_base="http://127.0.0.1:8787/v1",
    api_key="sawyer-local",
    model="local-qwen",
    is_chat_model=True
)

response = llm.complete("List 3 edge computing constraints.")
print(response.text)
```
