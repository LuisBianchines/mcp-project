
# MCP Server Demo (STDIO + JSON-RPC 2.0)

Servidor **MCP** didático em **Node.js** cobrindo:
- Handshake `initialize` (versão do protocolo **2025-06-18** + capacidades)
- **Primitivos**: `tools`, `resources`, `prompts`
- **Notificações**: `notifications/*/list_changed`
- Transporte: **STDIO**

## Estrutura
```
mcp-server-demo/
├─ package.json
├─ server.js
└─ demo-root/
   └─ hello.txt
```

## Rodando
```bash
npm install
npm run start
```
Crie o arquivo de demo:
```bash
echo "Hello from MCP!" > demo-root/hello.txt
```

## Testes rápidos (JSON-RPC linha-a-linha)

### initialize
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"test-client","version":"0.0.1"},"capabilities":{}}}' | node server.js
```

### tools/list
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node server.js
```

### tools/call (2 + 3)
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"calculator_arithmetic","arguments":{"op":"add","a":2,"b":3}}}' | node server.js
```

### resources/list
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":4,"method":"resources/list"}' | node server.js
```

### resources/read
Substitua a `uri` por uma retornada no `resources/list`.
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"file:///ABSOLUTE_PATH/mcp-server-demo/demo-root/hello.txt"}}' | node server.js
```

### prompts/list & prompts/get
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":6,"method":"prompts/list"}' | node server.js

printf '%s\n' '{"jsonrpc":"2.0","id":7,"method":"prompts/get","params":{"name":"hello-template","arguments":{"name":"Luis"}}}' | node server.js
```

## Observações
- **Roots**: o servidor respeita diretórios raiz de coordenação (não é mecanismo de segurança).
- **Conteúdo estruturado**: as respostas de `tools/call` retornam um array `content` que pode ser reutilizado como contexto por um Cliente MCP.
