const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Handlebars = require('handlebars');

const CORE_DIR = path.resolve(__dirname, '../core');
const OPENAPI_PATH = path.join(CORE_DIR, 'src/server/openapi.yaml');
const CONFIG_PATH = path.join(CORE_DIR, 'api-doc-config.json');
const PYTHON_OUT = path.resolve(__dirname, '../sdks/python/API_REFERENCE.md');
const TS_OUT = path.resolve(__dirname, '../sdks/typescript/API_REFERENCE.md');

// --- Helper Functions ---

function toSnakeCase(str) {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function resolveRef(ref, spec) {
    if (!ref || !ref.startsWith('#/')) return 'any';
    const parts = ref.split('/').slice(1);
    let current = spec;
    for (const part of parts) {
        current = current[part];
    }
    return current;
}

function getRefName(ref) {
    if (!ref) return 'any';
    const parts = ref.split('/');
    return parts[parts.length - 1];
}

// --- Main Generation Logic ---

function loadSpecs() {
    const openapiFn = fs.readFileSync(OPENAPI_PATH, 'utf8');
    const openapi = yaml.load(openapiFn);
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { openapi, config };
}

function parseMethods(openapi, config) {
    const methods = [];

    for (const [route, pathItem] of Object.entries(openapi.paths)) {
        // We only care about POST/GET with operationId
        const method = pathItem.post || pathItem.get;
        if (!method || !method.operationId) continue;

        // Skip healthCheck
        if (method.operationId === 'healthCheck') continue;

        const opId = method.operationId;
        const conf = config.methods[opId] || {};

        // Extract Description/Summary
        const summary = method.summary;
        const description = method.description || summary;

        // Extract Parameters from 'args' in requestBody
        const params = [];
        let argsSchema = null;
        let paramNames = [];

        if (method.requestBody) {
            const content = method.requestBody.content['application/json'];
            if (content && content.schema && content.schema.properties && content.schema.properties.args) {
                argsSchema = content.schema.properties.args;
            }
        } else if (method.parameters) {
            // Handle GET params if any (none in current spec for sidecar methods except exchange param)
        }

        if (argsSchema) {
            // Try to extract param names from description "[param1, param2]"
            if (argsSchema.description && argsSchema.description.startsWith('[')) {
                const inner = argsSchema.description.replace(/^\[|\]$/g, '');
                if (inner.trim().length > 0) {
                    paramNames = inner.split(',').map(s => s.trim().replace('?', ''));
                }
            }
            // Fallback if no description or empty
            if (paramNames.length === 0 && argsSchema.items && argsSchema.items.$ref) {
                // Single param case with defined type
                const refName = getRefName(argsSchema.items.$ref);
                paramNames = ['params'];
            }

            // Map names to types
            paramNames.forEach((name, idx) => {
                let type = 'any';
                let optional = name.endsWith('?') || (argsSchema.minItems !== undefined && idx >= argsSchema.minItems);

                // Determine type from items
                if (argsSchema.items) {
                    if (argsSchema.items.oneOf) {
                        // Heuristic: if index 0 is string, use string
                        if (idx === 0 && argsSchema.items.oneOf.some(s => s.type === 'string')) {
                            type = 'string';
                        } else {
                            // Try to find the complex type
                            const complex = argsSchema.items.oneOf.find(s => s.$ref);
                            if (complex) type = getRefName(complex.$ref);
                        }
                    } else if (argsSchema.items.$ref) {
                        type = getRefName(argsSchema.items.$ref);
                    } else if (argsSchema.items.type) {
                        type = argsSchema.items.type;
                    }
                }

                // Manual override for common ones
                if (name === 'id' || name === 'slug' || name === 'outcomeId' || name === 'marketId' || name === 'orderId' || name === 'query') type = 'string';
                if (name === 'params') optional = true;

                params.push({
                    name,
                    type,
                    optional,
                    description: name === 'params' ? 'Filter parameters' : (name === 'query' ? 'Search query' : name)
                });
            });
        }

        // Extract Return Type
        let returnType = 'any';
        const success = method.responses['200'];
        if (success && success.content && success.content['application/json']) {
            const schema = success.content['application/json'].schema;
            // Usually allOf: [BaseResponse, { properties: { data: ... } }]
            if (schema.allOf) {
                const dataPart = schema.allOf.find(s => s.properties && s.properties.data);
                if (dataPart) {
                    const dataSchema = dataPart.properties.data;
                    if (dataSchema.type === 'array' && dataSchema.items) {
                        const itemType = getRefName(dataSchema.items.$ref);
                        returnType = `${itemType}[]`;
                    } else if (dataSchema.$ref) {
                        returnType = getRefName(dataSchema.$ref);
                    }
                }
            }
        }

        // Add Workflow Example for this method if stored in config
        const examples = conf || { python: {}, typescript: {} };

        methods.push({
            name: opId,
            summary,
            description,
            params,
            returns: {
                type: returnType,
                description: success.description || 'Result'
            },
            example: examples, // contains .python.example and .typescript.example
            notes: typeof examples.notes === 'undefined' ? null : examples.notes
        });
    }

    // Add local-only methods (not in OpenAPI spec)
    for (const [opId, conf] of Object.entries(config.methods)) {
        if (methods.find(m => m.name === opId)) continue;

        methods.push({
            name: opId,
            summary: conf.summary || opId,
            description: conf.description || '',
            params: conf.params || [],
            returns: conf.returns || { type: 'any', description: '' },
            example: conf,
            notes: conf.notes || null
        });
    }

    return methods;
}

function parseModels(openapi) {
    const dataModels = [];
    const filterModels = [];

    const schemas = openapi.components.schemas;
    for (const [name, schema] of Object.entries(schemas)) {
        if (name.endsWith('Response') || name === 'BaseResponse' || name === 'ErrorDetail' || name === 'ErrorResponse') continue;

        const fields = [];
        if (schema.properties) {
            for (const [fname, fschema] of Object.entries(schema.properties)) {
                let type = fschema.type;
                if (fschema.$ref) type = getRefName(fschema.$ref);
                if (type === 'array' && fschema.items) {
                    const itype = fschema.items.$ref ? getRefName(fschema.items.$ref) : fschema.items.type;
                    type = `${itype}[]`;
                }

                fields.push({
                    name: fname,
                    type: type,
                    description: fschema.description || '',
                    required: (schema.required && schema.required.includes(fname))
                });
            }
        }

        const model = {
            name,
            description: schema.description || '',
            fields
        };

        if (name.endsWith('Params') || name.endsWith('Request')) {
            filterModels.push(model);
        } else {
            dataModels.push(model);
        }
    }

    return { dataModels, filterModels };
}

// --- Main Execution ---

const { openapi, config } = loadSpecs();
const methods = parseMethods(openapi, config);
const { dataModels, filterModels } = parseModels(openapi);

const context = {
    methods: methods.map(m => ({
        ...m,
        // Inject language specific example
        example: '{{LANGUAGE_EXAMPLE_PLACEHOLDER}}'
    })),
    workflowExample: '{{WORKFLOW_PLACEHOLDER}}',
    dataModels,
    filterModels
};

// --- Handlebars Setup ---

Handlebars.registerHelper('pythonName', (name) => toSnakeCase(name));
Handlebars.registerHelper('pythonType', (type) => {
    if (!type) return 'Any';
    if (type.endsWith('[]')) {
        return `List[${type.slice(0, -2)}]`;
    }
    const map = { string: 'str', number: 'float', integer: 'int', boolean: 'bool', any: 'Any' };
    return map[type] || type;
});
Handlebars.registerHelper('pythonParams', (params) => {
    if (!params) return '';
    return params.map(p => {
        const pname = toSnakeCase(p.name);
        let ptype = Handlebars.helpers.pythonType(p.type);
        if (p.optional) return `${pname}: Optional[${ptype}] = None`;
        return `${pname}: ${ptype}`;
    }).join(', ');
});

Handlebars.registerHelper('tsType', (type) => {
    if (!type) return 'any';
    const map = { integer: 'number' };
    return map[type] || type;
});
Handlebars.registerHelper('tsParams', (params) => {
    if (!params) return '';
    return params.map(p => {
        return `${p.name}${p.optional ? '?' : ''}: ${Handlebars.helpers.tsType(p.type)}`;
    }).join(', ');
});
Handlebars.registerHelper('tsOptional', (required) => required ? '' : '?');


// --- Render Python ---
const pythonTemplate = Handlebars.compile(
    fs.readFileSync(path.join(__dirname, 'templates/api-reference.python.md.hbs'), 'utf8'),
    { noEscape: true }
);

const pythonMethods = methods.map(m => ({
    ...m,
    example: (m.example && m.example.python && m.example.python.example) ? m.example.python.example : '# No example available'
}));

const pythonOut = pythonTemplate({
    methods: pythonMethods,
    dataModels,
    filterModels,
    workflowExample: config.workflowExample.python
});
fs.writeFileSync(PYTHON_OUT, pythonOut);
console.log(`Generated Python Docs: ${PYTHON_OUT}`);


// --- Render TypeScript ---
const tsTemplate = Handlebars.compile(
    fs.readFileSync(path.join(__dirname, 'templates/api-reference.typescript.md.hbs'), 'utf8'),
    { noEscape: true }
);

const tsMethods = methods.map(m => ({
    ...m,
    example: (m.example && m.example.typescript && m.example.typescript.example) ? m.example.typescript.example : '// No example available'
}));

const tsOut = tsTemplate({
    methods: tsMethods,
    dataModels,
    filterModels,
    workflowExample: config.workflowExample.typescript
});
fs.writeFileSync(TS_OUT, tsOut);
console.log(`Generated TypeScript Docs: ${TS_OUT}`);
