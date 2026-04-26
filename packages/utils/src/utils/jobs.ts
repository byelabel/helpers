import { sync } from 'glob';
import { existsSync, lstatSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createContext, Script } from 'node:vm';
import { throwAppError } from './error';
import { logError, logInfo, logWarning } from './log';
import { isFunction, isNonEmptyString } from './validator';

const upperFirst = (s: string): string => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export async function runJobs(path: string, ...args: any): Promise<void> {
  const jobsPath = resolve(path, 'jobs');

  if (existsSync(jobsPath)) {
    // set file names to job names as default
    let jobNames = await Promise.all(
      Array.from(sync(join(jobsPath, '**', '*.js'), { windowsPathsNoEscape: true }).values()).map(
        fileName => fileName.replace([jobsPath, sep].join(''), '').replace(/\.js$/, '').replace(new RegExp(`\\${sep}`, 'g'), '.')
      ).map(fileName => `${fileName.replace(/\.index$/, '')}.*`));

    if (process.env.JOBS !== '*') {
      jobNames = (process.env.JOBS || '').split(',').map(jobName => jobName.trim()).filter(jobName => isNonEmptyString(jobName));
    }

    for await (const jobName of jobNames) {
      try {
        let name = jobName, pattern = (process.env.JOBS === '*') ? '*' : null;

        if (name.lastIndexOf('.') > -1) {
          pattern = name.substring(name.lastIndexOf('.') + 1);
          name = name.substring(0, name.lastIndexOf('.'));
        }

        let filePath = join(jobsPath, ...name.split('.'));

        if (existsSync(filePath) && lstatSync(filePath).isDirectory()) {
          filePath = join(filePath, 'index');
        }

        filePath = `${filePath}.js`;

        if (!existsSync(filePath)) {
          throwAppError(`Job file not found: ${name}`, 'FILE_NOT_FOUND', {
            name
          });
        }

        const file = require(filePath);
        const functions: any = {};

        if (pattern === '*') {
          for (const functionName of Object.keys(file)) {
            functions[functionName === 'default' ? name : `${name}${upperFirst(functionName)}`] = file[functionName];
          }
        } else if (isNonEmptyString(pattern)) {
          functions[name] = file[pattern as string];
        } else {
          functions[name] = file.default;
        }

        for (const functionName of Object.keys(functions)) {
          const callback = functions[functionName];

          if (isFunction(callback)) {
            const context: any = {
              ...args,
              logError,
              [functionName]: callback
            };

            createContext(context);

            const scr = new Script(`try { ${functionName}(); } catch (e) { logError('Job (${functionName}) Run Error', e); }`);
            scr.runInContext(context);

            logInfo(`Job started: ${functionName}`).catch(() => {});
          } else {
            logWarning(`Job function not defined: ${functionName}`).catch(() => {});
          }
        }
      } catch (e) {
        logError(`Job (${jobName}) Start Error`, e as Error).catch(() => {});
      }
    }
  }
}
