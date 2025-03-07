import fs from 'fs';
import path from 'path';
import { toRequireContext } from '@storybook/core-common';
import registerRequireContextHook from 'babel-plugin-require-context-hook/register';
import global from 'global';
import { AnyFramework, ArgsEnhancer, ArgTypesEnhancer, DecoratorFunction } from '@storybook/csf';

import { ClientApi } from './Loader';
import { StoryshotsOptions } from '../api/StoryshotsOptions';

registerRequireContextHook();

const isFile = (file: string): boolean => {
  try {
    return fs.lstatSync(file).isFile();
  } catch (e) {
    return false;
  }
};

interface Output {
  preview?: string;
  stories?: string[];
}

const supportedExtensions = ['ts', 'tsx', 'js', 'jsx'];

const resolveFile = (configDir: string, supportedFilenames: string[]) =>
  supportedFilenames
    .flatMap((filename) =>
      supportedExtensions.map((ext) => path.join(configDir, `${filename}.${ext}`))
    )
    .find(isFile) || false;

export const getPreviewFile = (configDir: string): string | false =>
  resolveFile(configDir, ['preview', 'config']);

export const getMainFile = (configDir: string): string | false => resolveFile(configDir, ['main']);

function getConfigPathParts(input: string): Output {
  const configDir = path.resolve(input);

  if (fs.lstatSync(configDir).isDirectory()) {
    const output: Output = {};

    const preview = getPreviewFile(configDir);
    const main = getMainFile(configDir);

    if (preview) {
      output.preview = preview;
    }
    if (main) {
      const { stories = [] } = jest.requireActual(main);

      output.stories = stories.map(
        (pattern: string | { path: string; recursive: boolean; match: string }) => {
          const { path: basePath, recursive, match } = toRequireContext(pattern);
          const regex = new RegExp(match);

          // eslint-disable-next-line no-underscore-dangle
          return global.__requireContext(configDir, basePath, recursive, regex);
        }
      );
    }

    return output;
  }

  return { preview: configDir };
}

function configure<TFramework extends AnyFramework>(
  options: {
    storybook: ClientApi<TFramework>;
  } & StoryshotsOptions
): void {
  const { configPath = '.storybook', config, storybook } = options;

  if (config && typeof config === 'function') {
    config(storybook);
    return;
  }

  const { preview, stories } = getConfigPathParts(configPath);

  if (preview) {
    // This is essentially the same code as lib/core/src/server/preview/virtualModuleEntry.template
    const {
      parameters,
      decorators,
      globals,
      globalTypes,
      argsEnhancers,
      argTypesEnhancers,
    } = jest.requireActual(preview);

    if (decorators) {
      decorators.forEach((decorator: DecoratorFunction<TFramework>) =>
        storybook.addDecorator(decorator)
      );
    }
    if (parameters || globals || globalTypes) {
      storybook.addParameters({ ...parameters, globals, globalTypes });
    }
    if (argsEnhancers) {
      argsEnhancers.forEach((enhancer: ArgsEnhancer<TFramework>) =>
        storybook.addArgsEnhancer(enhancer as any)
      );
    }
    if (argTypesEnhancers) {
      argTypesEnhancers.forEach((enhancer: ArgTypesEnhancer<TFramework>) =>
        storybook.addArgTypesEnhancer(enhancer as any)
      );
    }
  }

  if (stories && stories.length) {
    storybook.configure(stories, false, false);
  }
}

export default configure;
