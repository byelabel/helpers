import { CustomHelpers, Schema, ValidationErrorItem } from 'joi';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppError, throwAppError } from './error';
import { isArray, isFunction, isNonEmptyArray, isPhoneNumber } from './validator';

export function validateSchema(schema: Schema, params: any, async = false): any {
  const mapErrors = (validationErrors: ValidationErrorItem[]) => {
    if (isNonEmptyArray(validationErrors)) {
      return validationErrors.map(detail => ({
        name: detail.path.join('.'),
        message: detail.message
      }));
    }

    return null;
  };

  if (async) {
    return new Promise(async (resolve, reject) => {
      try {
        const value = await schema.validateAsync(params);

        resolve(value);
      } catch (e) {
        const errors = mapErrors((e as any)?.details);

        reject(new AppError((e as Error)?.message, 'VALIDATION_ERROR', isNonEmptyArray(errors) ? { errors } : undefined));
      }
    });
  }

  const { value, error } = schema.validate(params);

  if (error) {
    const errors = mapErrors(error.details);

    throwAppError(error?.message, 'VALIDATION_ERROR', isNonEmptyArray(errors) ? { errors } : undefined);
  }

  return value;
}

export function phoneNumberValidation(value: any, helpers: CustomHelpers) {
  if (!isPhoneNumber(value)) {
    return helpers.error('any.invalid');
  }

  return value;
}

async function dataModel(rows: any | any[]) {
  if (!rows && !isNonEmptyArray(rows)) return rows;

  let returnType = 'array';

  if (!isArray(rows)) {
    rows = [rows as any];

    returnType = 'single';
  }

  let items: any[] = [];

  for await (let row of rows) {
    try {
      row = row.toJSON();
    } catch (e) {
    }

    items.push(row);
  }

  return returnType === 'single' ? (items?.[0] || null) : items;
}

export default async function dto(path: string, defaultDataModel?: Function) {
  let file: any = {}, filePath = `${path}.js`;

  if (!existsSync(filePath)) {
    filePath = join(path, 'index.js');
  }

  if (existsSync(filePath)) {
    file = require(filePath);
  }

  return {
    dataModel: isFunction(defaultDataModel) ? defaultDataModel : dataModel,
    ...file
  };
}
