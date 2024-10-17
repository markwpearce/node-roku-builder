import { LogLevel } from './logger.js';
export interface Dictionary<Type> {
    [key: string]: Type;
}
export interface RokuBuilderFileInfo {
    relativeFilePath: string;
    absoluteFilePath: string;
}
export interface Options {
    source: string;
    target: string;
    brand: string;
    logLevel?: LogLevel;
}
export interface FinalConfig {
    manifest?: {
        bs_const: Dictionary<boolean>;
        [key: string]: any;
    };
    replacements?: Dictionary<string>;
    '!files'?: RokuBuilderFileInfo[];
    '!config'?: Dictionary<Dictionary<any>>;
    replacements_files?: string[];
    [key: string]: any;
    resolutions?: string[];
}
declare function doBuild(options: Options): Promise<void>;
/**
 *  Loads the config file at <options.source>/.roku_builder_rebrand.json
 * @param options
 * @returns true if config loaded successfully
 */
declare function loadConfig(options: Options): boolean;
declare function loadBrands(configData: Dictionary<any>): Array<string>;
/**
 * Gets a entire list of brands available, with full configs
 * @param options
 * @returns
 */
declare function getBrandConfigs(options: Options): Dictionary<any>;
/**
 * Gets the completed finalized configuration for a particular brand
 * @param currentBrand
 * @param brandConfigs
 * @returns finalized config for the given brand
 */
declare function processBrand(currentBrandName: string, brandConfigs: Dictionary<any>): FinalConfig;
/**
 * Gets all the text replacements as defined by the finalConfig
 * @param finalConfig
 * @param options
 * @returns
 */
declare function getReplacements(finalConfig: FinalConfig, options: Options): Dictionary<string>;
/**
 * Writes out any animations as described in the finalConfig to the options.target directory
 * @param finalConfig
 * @param options
 */
declare function writeAnimations(finalConfig: FinalConfig, options: Options): void;
/**
 * Writes out the manifest as described in the finalConfig to the options.target directory
 * @param finalConfig
 * @param options
 */
declare function writeManifest(finalConfig: FinalConfig, options: Options): void;
/**
 * Writes out the configs as described in the finalConfig to the options.target directory
 * @param finalConfig
 * @param options
 */
declare function writeConfig(finalConfig: FinalConfig, options: Options): void;
/**
 * Replaces in `str` all the instances of each member of findArray with the same index of replaceArray
 * @returns the converted string
 */
declare function replaceBulk(str: string, findArray: string[], replaceArray: string[]): string;
export { doBuild, loadConfig, loadBrands, getBrandConfigs, processBrand, getReplacements, writeAnimations, writeManifest, writeConfig, replaceBulk, LogLevel };
