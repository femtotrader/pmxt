const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Handlebars = require('handlebars');

const CORE_DIR = path.resolve(__dirname, '../core');
const OPENAPI_PATH = path.join(CORE_DIR, 'src/server/openapi.yaml');
const GENERATED_CONFIG_PATH = path.join(CORE_DIR, 'api-doc-config.generated.json');
const PYTHON_OUT = path.resolve(__dirname, '../sdks/python/API_REFERENCE.md');
const TS_OUT = path.resolve(__dirname, '../sdks/typescript/API_REFERENCE.md');

// --- Helper Functions ---

function toSnakeCase(str) {
    // Handle consecutive uppercase letters and mixed-case acronyms (like PnL)
    // Insert underscore before uppercase letter if:
    // 1. Preceded by lowercase letter, UNLESS that lowercase is part of an acronym
    //    (e.g., testData -> test_data, but PnL -> pnl)
    // 2. Preceded by uppercase AND followed by lowercase (XMLParser -> xml_parser)
    return str
        .replace(/(?<![A-Z])([a-z])([A-Z])/g, '$1_$2')  // aB -> a_B, but not after uppercase
        .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')       // ABc -> A_Bc
        .toLowerCase();
}

function getRefName(ref) {
    if (!ref) return 'any';
    const parts = ref.split('/');
    return parts[parts.length - 1];
}

// --- Load Sources ---

function loadSpecs() {
    const openapi = yaml.load(fs.readFileSync(OPENAPI_PATH, 'utf8'));

    if (!fs.existsSync(GENERATED_CONFIG_PATH)) {
        console.error(`Error: ${GENERATED_CONFIG_PATH} not found. Run 'npm run extract:jsdoc' first.`);
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(GENERATED_CONFIG_PATH, 'utf8'));

    return { openapi, config };
}

// --- Method Parsing (from JSDoc-extracted config) ---

function parseMethods(config) {
    const methods = [];

    for (const [name, data] of Object.entries(config.methods)) {
        methods.push({
            name,
            summary: data.summary || name,
            description: data.description || data.summary || '',
            params: (data.params || []).map(p => ({
                name: p.name,
                type: p.type || 'any',
                optional: p.optional || false,
                description: p.description || p.name
            })),
            subParams: data.subParams || null,
            returns: data.returns || { type: 'any', description: 'Result' },
            python: data.python || { examples: [] },
            typescript: data.typescript || { examples: [] },
            notes: data.notes || null,
            exchangeOnly: data.exchangeOnly || null
        });
    }

    return methods;
}

// --- Model Parsing (from OpenAPI spec - unchanged) ---

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

// --- Format Examples ---

function formatExamples(examples, commentPrefix) {
    if (!examples || examples.length === 0) {
        return `${commentPrefix} No example available`;
    }
    return examples.map(ex => {
        const title = ex.title ? `${commentPrefix} ${ex.title}\n` : '';
        return `${title}${ex.code}`;
    }).join('\n\n');
}

// --- Main Execution ---

const { openapi, config } = loadSpecs();
const methods = parseMethods(config);
const { dataModels, filterModels } = parseModels(openapi);

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
    example: formatExamples(m.python.examples, '#'),
    exchangeNote: m.exchangeOnly ? `> **Note**: This method is only available on **${m.exchangeOnly}** exchange.\n` : ''
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
    example: formatExamples(m.typescript.examples, '//'),
    exchangeNote: m.exchangeOnly ? `> **Note**: This method is only available on **${m.exchangeOnly}** exchange.\n` : ''
}));

const tsOut = tsTemplate({
    methods: tsMethods,
    dataModels,
    filterModels,
    workflowExample: config.workflowExample.typescript
});
fs.writeFileSync(TS_OUT, tsOut);
console.log(`Generated TypeScript Docs: ${TS_OUT}`);
