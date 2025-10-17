// server.js — Servidor MCP didático (JSON-RPC 2.0 via STDIO)
// Conceitos cobertos:
// - Handshake initialize (negociação de versão e capacidades) — versão do protocolo 2025-06-18
// - Primitivos: tools (list/call), resources (list/read), prompts (list/get)
// - Notificações list_changed (JSON-RPC notification, sem id)
// Transporte: STDIO (process.stdin/process.stdout)

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// ======= Configuração básica =======
const PROTOCOL_VERSION = "2025-06-18"; // Versão de protocolo (negociação)
const ROOTS = [ path.resolve("demo-root") ]; // Raízes coordenadas (não é limite de segurança)

// Registry em memória (poderia ser dinâmico)
const tools = [
  {
    name: "calculator_arithmetic",
    title: "Calculator (basic arithmetic)",
    description: "Soma, subtração, multiplicação e divisão de dois números.",
    inputSchema: {
      type: "object",
      required: ["op", "a", "b"],
      properties: {
        op: { type: "string", enum: ["add", "sub", "mul", "div"] },
        a: { type: "number" },
        b: { type: "number" }
      }
    }
  }
];

const prompts = [
  {
    name: "hello-template",
    title: "Hello Prompt",
    description: "Saudação com variável {{name}}",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } }
    },
    template: "Olá, {{name}}! Bem-vindo ao Servidor MCP de demonstração."
  }
];

// Resources: listamos arquivos legíveis sob ROOTS
function scanResources() {
  const out = [];
  for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile()) {
        const full = path.join(root, e.name);
        out.push({
          uri: "file://" + full,
          mimeType: "text/plain",
          name: e.name,
          description: "Arquivo de demonstração"
        });
      }
    }
  }
  return out;
}

// ======= Util JSON-RPC =======
function send(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}
function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function error(id, code, message, data) {
  send({ jsonrpc: "2.0", id, error: { code, message, data } });
}
function notify(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

// ======= Implementação de métodos MCP =======
function handleInitialize(id, params) {
  const clientInfo = params?.clientInfo ?? {};
  const result = {
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: { name: "mcp-server-demo", version: "0.1.0" },
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true },
      prompts: { listChanged: true }
    }
  };
  reply(id, result);

  // Simula atualização dinâmica e envia notificações após 5 segundos
  setTimeout(() => {
    notify("notifications/tools/list_changed", {});
    notify("notifications/resources/list_changed", {});
    notify("notifications/prompts/list_changed", {});
  }, 5000);
}

function handleToolsList(id) {
  reply(id, { tools });
}

function handleToolsCall(id, params) {
  const { name, arguments: args } = params ?? {};
  if (name === "calculator_arithmetic") {
    const { op, a, b } = args ?? {};
    if (typeof a !== "number" || typeof b !== "number") {
      return error(id, -32602, "Parâmetros inválidos", { expected: "numbers a,b" });
    }
    let value;
    switch (op) {
      case "add": value = a + b; break;
      case "sub": value = a - b; break;
      case "mul": value = a * b; break;
      case "div":
        if (b === 0) return error(id, -32000, "Divisão por zero");
        value = a / b;
        break;
      default:
        return error(id, -32602, "Operação inválida", { allowed: ["add","sub","mul","div"] });
    }
    return reply(id, { content: [{ type: "text", text: String(value) }], meta: { value } });
  }
  return error(id, -32601, `Tool não encontrada: ${name}`);
}

function handleResourcesList(id) {
  reply(id, { resources: scanResources() });
}

function handleResourcesRead(id, params) {
  const uri = params?.uri;
  if (!uri || !uri.startsWith("file://")) {
    return error(id, -32602, "URI inválida. Use file://");
  }
  const filePath = uri.replace("file://", "");
  // Coordenação: respeitar ROOTS (boa prática; não substitui sandbox real)
  const pathMod = path;
  const allowed = ROOTS.some(root => filePath.startsWith(root + pathMod.sep));
  if (!allowed) return error(id, -32001, "Fora das raízes permitidas (roots).");

  try {
    const data = fs.readFileSync(filePath, "utf8");
    reply(id, { contents: [{ mimeType: "text/plain", uri, text: data }] });
  } catch (e) {
    error(id, -32002, "Falha ao ler recurso", { message: e.message });
  }
}

function handlePromptsList(id) {
  const list = prompts.map(p => ({
    name: p.name, title: p.title, description: p.description, inputSchema: p.inputSchema
  }));
  reply(id, { prompts: list });
}

function handlePromptsGet(id, params) {
  const name = params?.name;
  const prompt = prompts.find(p => p.name === name);
  if (!prompt) return error(id, -32601, `Prompt não encontrado: ${name}`);

  const vars = params?.arguments ?? {};
  if (prompt.inputSchema?.required?.some(k => !(k in vars))) {
    return error(id, -32602, "Argumentos ausentes para o prompt", { required: prompt.inputSchema.required });
  }
  const rendered = prompt.template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
  reply(id, {
    prompt: { name: prompt.name, messages: [{ role: "system", content: rendered }] }
  });
}

// ======= Loop JSON-RPC (STDIO) =======
const rl = readline.createInterface({ input: process.stdin, output: undefined, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) {
    return send({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } });
  }
  const { id, method, params } = msg;

  try {
    switch (method) {
      case "initialize":
        return handleInitialize(id, params);
      case "tools/list":
        return handleToolsList(id);
      case "tools/call":
        return handleToolsCall(id, params);
      case "resources/list":
        return handleResourcesList(id);
      case "resources/read":
        return handleResourcesRead(id, params);
      case "prompts/list":
        return handlePromptsList(id);
      case "prompts/get":
        return handlePromptsGet(id, params);
      default:
        if (id !== undefined) error(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (id !== undefined) error(id, -32603, "Internal error", { message: err?.message });
  }
});

process.on('SIGINT', () => process.exit(0));
