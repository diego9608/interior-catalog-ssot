const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

// Load JSON schemas
const schemas = {
  material: loadSchema('material.schema.json'),
  hardware: loadSchema('hardware.schema.json'),
  adhesive: loadSchema('adhesive.schema.json'),
  vendor: loadSchema('vendor.schema.json')
};

// Schema type mapping
const schemaMapping = {
  materials: 'material',
  hardware: 'hardware',
  adhesives: 'adhesive',
  vendors: 'vendor'
};

let errorCount = 0;
let fileCount = 0;

function loadSchema(filename) {
  const schemaPath = path.join(__dirname, '..', 'schemas', filename);
  try {
    return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (error) {
    console.error(`${colors.red}Failed to load schema ${filename}: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

function validateFile(filePath, schema, schemaType) {
  fileCount++;
  const relPath = path.relative(process.cwd(), filePath);
  
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const errors = [];
    
    // Validate required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in content)) {
          errors.push({
            field,
            code: `E-${schemaType.toUpperCase()}-001`,
            message: `Missing ${field}`
          });
        }
      }
    }
    
    // Validate field types and constraints
    for (const [field, value] of Object.entries(content)) {
      if (schema.properties && schema.properties[field]) {
        const fieldSchema = schema.properties[field];
        const fieldErrors = validateField(field, value, fieldSchema, schemaType);
        errors.push(...fieldErrors);
      }
    }
    
    // Special validation for material type 'cuarzo'
    if (schemaType === 'material' && content.tipo === 'cuarzo') {
      if (!content.limites || !content.limites.calor_directo_c) {
        errors.push({
          field: 'limites.calor_directo_c',
          code: 'E-MAT-002',
          message: 'Required limites.calor_directo_c for tipo=cuarzo'
        });
      }
    }
    
    // Print errors if any
    if (errors.length > 0) {
      errorCount += errors.length;
      for (const error of errors) {
        console.error(`${colors.red}${error.code} ${error.message} in ${content.id || 'unknown'} (${relPath})${colors.reset}`);
      }
    } else {
      console.log(`${colors.gray}✓ ${relPath}${colors.reset}`);
    }
    
  } catch (error) {
    errorCount++;
    console.error(`${colors.red}E-JSON-001 Invalid JSON in ${relPath}: ${error.message}${colors.reset}`);
  }
}

function validateField(fieldName, value, fieldSchema, schemaType) {
  const errors = [];
  const prefix = schemaType.substring(0, 3).toUpperCase();
  
  // Type validation
  if (fieldSchema.type) {
    let actualType = Array.isArray(value) ? 'array' : typeof value;
    
    // Special handling for integer type
    if (fieldSchema.type === 'integer' && typeof value === 'number') {
      if (!Number.isInteger(value)) {
        errors.push({
          field: fieldName,
          code: `E-${prefix}-003`,
          message: `Invalid type for ${fieldName}: expected integer, got decimal`
        });
        return errors;
      }
      actualType = 'integer'; // Consider it as integer if it passes the check
    }
    
    if (fieldSchema.type !== actualType && !(fieldSchema.type === 'integer' && actualType === 'number')) {
      errors.push({
        field: fieldName,
        code: `E-${prefix}-003`,
        message: `Invalid type for ${fieldName}: expected ${fieldSchema.type}, got ${actualType}`
      });
      return errors; // Skip further validation if type is wrong
    }
  }
  
  // Pattern validation (for IDs)
  if (fieldSchema.pattern && typeof value === 'string') {
    const regex = new RegExp(fieldSchema.pattern);
    if (!regex.test(value)) {
      errors.push({
        field: fieldName,
        code: `E-${prefix}-004`,
        message: `Invalid ID format for ${fieldName}: must match ${fieldSchema.pattern}`
      });
    }
  }
  
  // Enum validation
  if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
    errors.push({
      field: fieldName,
      code: `E-${prefix}-005`,
      message: `Invalid value for ${fieldName}: must be one of [${fieldSchema.enum.join(', ')}]`
    });
  }
  
  // Number constraints
  if (typeof value === 'number') {
    if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
      errors.push({
        field: fieldName,
        code: `E-${prefix}-006`,
        message: `Value for ${fieldName} below minimum: ${value} < ${fieldSchema.minimum}`
      });
    }
    if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
      errors.push({
        field: fieldName,
        code: `E-${prefix}-007`,
        message: `Range 0-10 exceeded for ${fieldName}: ${value}`
      });
    }
  }
  
  // Array validation
  if (Array.isArray(value)) {
    if (fieldSchema.minItems && value.length < fieldSchema.minItems) {
      errors.push({
        field: fieldName,
        code: `E-${prefix}-008`,
        message: `Array ${fieldName} has too few items: ${value.length} < ${fieldSchema.minItems}`
      });
    }
    if (fieldSchema.items) {
      value.forEach((item, index) => {
        const itemErrors = validateField(`${fieldName}[${index}]`, item, fieldSchema.items, schemaType);
        errors.push(...itemErrors);
      });
    }
  }
  
  // Object validation (nested)
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    if (fieldSchema.properties) {
      for (const [subField, subValue] of Object.entries(value)) {
        if (fieldSchema.properties[subField]) {
          const subErrors = validateField(`${fieldName}.${subField}`, subValue, fieldSchema.properties[subField], schemaType);
          errors.push(...subErrors);
        }
      }
    }
    if (fieldSchema.required) {
      for (const reqField of fieldSchema.required) {
        if (!(reqField in value)) {
          errors.push({
            field: `${fieldName}.${reqField}`,
            code: `E-${prefix}-001`,
            message: `Missing ${fieldName}.${reqField}`
          });
        }
      }
    }
  }
  
  // Email format validation
  if (fieldSchema.format === 'email' && typeof value === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push({
        field: fieldName,
        code: `E-${prefix}-009`,
        message: `Invalid email format for ${fieldName}`
      });
    }
  }
  
  return errors;
}

function validateDirectory(dirPath) {
  const catalogPath = path.join(dirPath, 'data', 'catalog');
  
  // Check if catalog directory exists
  if (!fs.existsSync(catalogPath)) {
    console.error(`${colors.red}Catalog directory not found: ${catalogPath}${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`${colors.blue}Validating catalog files...${colors.reset}\n`);
  
  // Validate each catalog type
  for (const [folder, schemaType] of Object.entries(schemaMapping)) {
    const folderPath = path.join(catalogPath, folder);
    
    if (!fs.existsSync(folderPath)) {
      console.log(`${colors.yellow}Skipping ${folder}: directory not found${colors.reset}`);
      continue;
    }
    
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
      console.log(`${colors.gray}No files in ${folder}${colors.reset}`);
      continue;
    }
    
    console.log(`${colors.blue}Validating ${folder}:${colors.reset}`);
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      validateFile(filePath, schemas[schemaType], schemaType);
    }
    console.log('');
  }
  
  // Validate tokens (basic JSON validation only)
  const tokensPath = path.join(catalogPath, 'tokens');
  if (fs.existsSync(tokensPath)) {
    const tokenFiles = fs.readdirSync(tokensPath).filter(f => f.endsWith('.json'));
    if (tokenFiles.length > 0) {
      console.log(`${colors.blue}Validating tokens:${colors.reset}`);
      for (const file of tokenFiles) {
        const filePath = path.join(tokensPath, file);
        fileCount++;
        try {
          JSON.parse(fs.readFileSync(filePath, 'utf8'));
          console.log(`${colors.gray}✓ ${path.relative(process.cwd(), filePath)}${colors.reset}`);
        } catch (error) {
          errorCount++;
          console.error(`${colors.red}E-JSON-001 Invalid JSON in ${path.relative(process.cwd(), filePath)}: ${error.message}${colors.reset}`);
        }
      }
      console.log('');
    }
  }
}

// Main execution
const projectRoot = path.resolve(__dirname, '..');
validateDirectory(projectRoot);

// Summary
console.log(`${colors.blue}${'─'.repeat(50)}${colors.reset}`);
console.log(`${colors.blue}Validation Summary:${colors.reset}`);
console.log(`Files checked: ${fileCount}`);
console.log(`Errors found: ${errorCount}`);

if (errorCount === 0) {
  console.log(`\n${colors.green}✅ All catalogs valid${colors.reset}`);
  process.exit(0);
} else {
  console.log(`\n${colors.red}❌ Validation failed with ${errorCount} error(s)${colors.reset}`);
  process.exit(1);
}