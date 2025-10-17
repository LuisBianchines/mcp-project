let AjvCtor;
let ajvOptions = {
  allErrors: true,
  strict: false,
  messages: true
};

try {
  const mod = await import('ajv');
  AjvCtor = mod.default ?? mod;
} catch (error) {
  AjvCtor = class {
    constructor() {}
    compile(schema) {
      return createSimpleValidator(schema);
    }
  };
  ajvOptions = undefined;
  console.warn('[validation] Pacote "ajv" não encontrado; usando validador interno simplificado.');
}

const ajv = ajvOptions ? new AjvCtor(ajvOptions) : new AjvCtor();

let toolValidators = new Map();
let promptValidators = new Map();

function escapeJsonPointer(str) {
  return str.replace(/~/g, '~0').replace(/\//g, '~1');
}

function validateAgainstSchema(value, schema, path, errors) {
  if (!schema) return true;
  let valid = true;

  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push({
        instancePath: path,
        keyword: 'type',
        params: { type: 'object' },
        message: 'must be object'
      });
      return false;
    }

    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!(key in value)) {
        errors.push({
          instancePath: path,
          keyword: 'required',
          params: { missingProperty: key },
          message: `must have required property '${key}'`
        });
        valid = false;
      }
    }

    const properties = schema.properties ?? {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value) {
        const childPath = path ? `${path}/${escapeJsonPointer(key)}` : `/${escapeJsonPointer(key)}`;
        if (!validateAgainstSchema(value[key], childSchema, childPath, errors)) {
          valid = false;
        }
      }
    }

    return valid;
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      errors.push({
        instancePath: path,
        keyword: 'type',
        params: { type: 'number' },
        message: 'must be number'
      });
      valid = false;
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push({
        instancePath: path,
        keyword: 'type',
        params: { type: 'string' },
        message: 'must be string'
      });
      valid = false;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      instancePath: path,
      keyword: 'enum',
      params: { allowedValues: schema.enum },
      message: 'must be equal to one of the allowed values'
    });
    valid = false;
  }

  return valid;
}

function createSimpleValidator(schema) {
  const validate = (data) => {
    const errors = [];
    const isValid = validateAgainstSchema(data, schema, '', errors);
    validate.errors = errors.length ? errors : null;
    return isValid;
  };
  validate.errors = null;
  return validate;
}

function compileEntries(entries, type) {
  const map = new Map();
  for (const entry of entries) {
    if (!entry?.name || !entry?.inputSchema) continue;
    try {
      const validate = ajv.compile(entry.inputSchema);
      map.set(entry.name, validate);
    } catch (err) {
      console.error(`Falha ao compilar schema ${type} "${entry?.name}":`, err);
    }
  }
  return map;
}

export function initializeValidators({ tools = [], prompts = [] } = {}) {
  toolValidators = compileEntries(tools, 'tool');
  promptValidators = compileEntries(prompts, 'prompt');
  return {
    toolValidators,
    promptValidators
  };
}

export function getToolValidator(name) {
  return toolValidators.get(name);
}

export function getPromptValidator(name) {
  return promptValidators.get(name);
}

export function getAjvInstance() {
  return ajv;
}
