// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  ConfigurationFile,
  InheritanceType,
  PathResolutionMethod,
  type IJsonPathMetadataResolverOptions
} from '@rushstack/heft-config-file';
import { Import, PackageJsonLookup, InternalError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import type { IRigConfig } from '@rushstack/rig-package';

import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { INodeServicePluginConfiguration } from '../plugins/NodeServicePlugin';
import { Constants } from './Constants';
import {
  type ISetEnvironmentVariablesPluginOptions,
  PLUGIN_NAME as setEnvVarsPluginName
} from '../plugins/SetEnvironmentVariablesPlugin';

export interface IHeftConfigurationJsonActionReference {
  actionName: string;
  defaultParameters?: string[];
}

export interface IHeftConfigurationJsonAliases {
  [aliasName: string]: IHeftConfigurationJsonActionReference;
}

export interface IHeftConfigurationJsonPluginSpecifier {
  pluginPackage: string;
  pluginPackageRoot: string;
  pluginName?: string;
  options?: object;
}

export interface IHeftConfigurationJsonTaskSpecifier {
  taskDependencies?: string[];
  taskPlugin: IHeftConfigurationJsonPluginSpecifier;
}

export interface IHeftConfigurationJsonTasks {
  [taskName: string]: IHeftConfigurationJsonTaskSpecifier;
}

export interface IHeftConfigurationJsonPhaseSpecifier {
  phaseDescription?: string;
  phaseDependencies?: string[];
  cleanFiles?: IDeleteOperation[];
  tasksByName?: IHeftConfigurationJsonTasks;
}

export interface IHeftConfigurationJsonPhases {
  [phaseName: string]: IHeftConfigurationJsonPhaseSpecifier;
}

export interface IHeftConfigurationJson {
  heftPlugins?: IHeftConfigurationJsonPluginSpecifier[];
  aliasesByName?: IHeftConfigurationJsonAliases;
  phasesByName?: IHeftConfigurationJsonPhases;
}

export class CoreConfigFiles {
  private static _heftConfigFileLoader: ConfigurationFile<IHeftConfigurationJson> | undefined;
  private static _nodeServiceConfigurationLoader:
    | ConfigurationFile<INodeServicePluginConfiguration>
    | undefined;

  public static heftConfigurationProjectRelativeFilePath: string = `${Constants.projectConfigFolderName}/${Constants.heftConfigurationFilename}`;

  public static nodeServiceConfigurationProjectRelativeFilePath: string = `${Constants.projectConfigFolderName}/${Constants.nodeServiceConfigurationFilename}`;

  /**
   * Returns the loader for the `config/heft.json` config file.
   */
  public static async loadHeftConfigurationFileForProjectAsync(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: IRigConfig | undefined
  ): Promise<IHeftConfigurationJson> {
    if (!CoreConfigFiles._heftConfigFileLoader) {
      const heftPluginPackageFolder: string | undefined =
        PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
      if (!heftPluginPackageFolder) {
        // This should never happen
        throw new InternalError('Unable to find the @rushstack/heft package folder');
      }

      const pluginPackageResolver: (
        options: IJsonPathMetadataResolverOptions<IHeftConfigurationJson>
      ) => string = (options: IJsonPathMetadataResolverOptions<IHeftConfigurationJson>) => {
        const { propertyValue, configurationFilePath } = options;
        if (propertyValue === Constants.heftPackageName) {
          // If the value is "@rushstack/heft", then resolve to the Heft package that is
          // installed in the project folder. This avoids issues with mismatched versions
          // between the project and the globally installed Heft. Use the PackageJsonLookup
          // class to find the package folder to avoid hardcoding the path for compatibility
          // with bundling.
          return heftPluginPackageFolder;
        } else {
          const configurationFileDirectory: string = path.dirname(configurationFilePath);
          return Import.resolvePackage({
            packageName: propertyValue,
            baseFolderPath: configurationFileDirectory,
            allowSelfReference: true
          });
        }
      };

      const schemaObject: object = await import('../schemas/heft.schema.json');
      CoreConfigFiles._heftConfigFileLoader = new ConfigurationFile<IHeftConfigurationJson>({
        projectRelativeFilePath: CoreConfigFiles.heftConfigurationProjectRelativeFilePath,
        jsonSchemaObject: schemaObject,
        propertyInheritanceDefaults: {
          array: { inheritanceType: InheritanceType.append },
          object: { inheritanceType: InheritanceType.merge }
        },
        propertyInheritance: {
          heftPlugins: {
            inheritanceType: InheritanceType.custom,
            inheritanceFunction: (current, parent) => {
              if (!current) {
                return parent;
              } else if (!parent) {
                return current;
              } else {
                // Special-case the "set-environment-variables-plugin" to merge the environment variables
                // that are being set instead of including two copies of the plugin when there are multiple
                // config files in the extends chain that reference the plugin.
                let mergedEnvironmentVariablesToSet: Record<string, string> | undefined;
                function processLifecyclePlugins(pluginList: IHeftConfigurationJsonPluginSpecifier[]): void {
                  for (let i: number = 0; i < pluginList.length; i++) {
                    const lifecyclePlugin: IHeftConfigurationJsonPluginSpecifier = pluginList[i];
                    const { pluginName, pluginPackage, options } = lifecyclePlugin;
                    if (pluginName === setEnvVarsPluginName && pluginPackage === heftPluginPackageFolder) {
                      const { environmentVariablesToSet } = options as ISetEnvironmentVariablesPluginOptions;
                      if (!mergedEnvironmentVariablesToSet) {
                        mergedEnvironmentVariablesToSet = environmentVariablesToSet;
                      } else {
                        Object.assign(mergedEnvironmentVariablesToSet, environmentVariablesToSet);
                        pluginList.splice(i, 1);
                        i--;
                      }
                    }
                  }
                }
                processLifecyclePlugins(parent);
                processLifecyclePlugins(current);
                return [...parent, ...current];
              }
            }
          }
        },
        jsonPathMetadata: {
          // Use a custom resolver for the plugin packages, since the NodeResolve algorithm will resolve to the
          // package.json exports/module property, which may or may not exist.
          '$.heftPlugins.*.pluginPackage': {
            pathResolutionMethod: PathResolutionMethod.custom,
            customResolver: pluginPackageResolver
          },
          // Use a custom resolver for the plugin packages, since the NodeResolve algorithm will resolve to the
          // package.json exports/module property, which may or may not exist.
          '$.phasesByName.*.tasksByName.*.taskPlugin.pluginPackage': {
            pathResolutionMethod: PathResolutionMethod.custom,
            customResolver: pluginPackageResolver
          }
        }
      });
    }

    const heftConfigFileLoader: ConfigurationFile<IHeftConfigurationJson> =
      CoreConfigFiles._heftConfigFileLoader;

    let configurationFile: IHeftConfigurationJson;
    try {
      configurationFile = await heftConfigFileLoader.loadConfigurationFileForProjectAsync(
        terminal,
        projectPath,
        rigConfig
      );
    } catch (e: unknown) {
      if (
        !(e instanceof Error) ||
        !e.message.startsWith('Resolved configuration object does not match schema')
      ) {
        throw e;
      }

      try {
        // If the config file doesn't match the schema, then we should check to see if it does
        // match the legacy schema. We don't need to worry about the resulting object, we just
        // want to see if it parses. We will use the ConfigurationFile class to load it to ensure
        // that we follow the "extends" chain for the entire config file.
        const legacySchemaObject: object = await import('../schemas/heft-legacy.schema.json');
        const legacyConfigFileLoader: ConfigurationFile<unknown> = new ConfigurationFile<unknown>({
          projectRelativeFilePath: CoreConfigFiles.heftConfigurationProjectRelativeFilePath,
          jsonSchemaObject: legacySchemaObject
        });
        await legacyConfigFileLoader.loadConfigurationFileForProjectAsync(terminal, projectPath, rigConfig);
      } catch (e2) {
        // It doesn't match the legacy schema either. Throw the original error.
        throw e;
      }
      // Matches the legacy schema, so throw a more helpful error.
      throw new Error(
        "This project's Heft configuration appears to be using an outdated schema.\n\n" +
          'Heft 0.51.0 introduced a major breaking change for Heft configuration files. ' +
          'Your project appears to be using the older file format. You will need to ' +
          'migrate your project to the new format. Follow these instructions: ' +
          'https://rushstack.io/link/heft-0.51'
      );
    }

    // The pluginPackage field was resolved to the root of the package, but we also want to have
    // the original plugin package name in the config file.
    function getUpdatedPluginSpecifier(
      rawSpecifier: IHeftConfigurationJsonPluginSpecifier
    ): IHeftConfigurationJsonPluginSpecifier {
      const pluginPackageName: string = heftConfigFileLoader.getPropertyOriginalValue({
        parentObject: rawSpecifier,
        propertyName: 'pluginPackage'
      })!;
      const newSpecifier: IHeftConfigurationJsonPluginSpecifier = {
        ...rawSpecifier,
        pluginPackageRoot: rawSpecifier.pluginPackage,
        pluginPackage: pluginPackageName
      };
      return newSpecifier;
    }

    const phasesByName: IHeftConfigurationJsonPhases = {};

    const normalizedConfigurationFile: IHeftConfigurationJson = {
      ...configurationFile,
      heftPlugins: configurationFile.heftPlugins?.map(getUpdatedPluginSpecifier) ?? [],
      phasesByName
    };

    for (const [phaseName, phase] of Object.entries(configurationFile.phasesByName || {})) {
      const tasksByName: IHeftConfigurationJsonTasks = {};
      phasesByName[phaseName] = {
        ...phase,
        tasksByName
      };

      for (const [taskName, task] of Object.entries(phase.tasksByName || {})) {
        if (task.taskPlugin) {
          tasksByName[taskName] = {
            ...task,
            taskPlugin: getUpdatedPluginSpecifier(task.taskPlugin)
          };
        } else {
          tasksByName[taskName] = task;
        }
      }
    }

    return normalizedConfigurationFile;
  }

  public static async tryLoadNodeServiceConfigurationFileAsync(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: IRigConfig | undefined
  ): Promise<INodeServicePluginConfiguration | undefined> {
    if (!CoreConfigFiles._nodeServiceConfigurationLoader) {
      const schemaObject: object = await import('../schemas/node-service.schema.json');
      CoreConfigFiles._nodeServiceConfigurationLoader =
        new ConfigurationFile<INodeServicePluginConfiguration>({
          projectRelativeFilePath: CoreConfigFiles.nodeServiceConfigurationProjectRelativeFilePath,
          jsonSchemaObject: schemaObject
        });
    }

    const configurationFile: INodeServicePluginConfiguration | undefined =
      await CoreConfigFiles._nodeServiceConfigurationLoader.tryLoadConfigurationFileForProjectAsync(
        terminal,
        projectPath,
        rigConfig
      );
    return configurationFile;
  }
}
