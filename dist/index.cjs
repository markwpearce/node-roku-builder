'use strict';

var fs = require('fs');
var path = require('path');
var glob = require('glob');
var JSON5 = require('json5');
var omggif = require('omggif');
var gm = require('gm');
var mergician = require('mergician');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var fs__namespace = /*#__PURE__*/_interopNamespaceDefault(fs);
var path__namespace = /*#__PURE__*/_interopNamespaceDefault(path);
var glob__namespace = /*#__PURE__*/_interopNamespaceDefault(glob);
var omggif__namespace = /*#__PURE__*/_interopNamespaceDefault(omggif);

var LogLevelNumber;
(function (LogLevelNumber) {
    LogLevelNumber[LogLevelNumber["off"] = 0] = "off";
    LogLevelNumber[LogLevelNumber["error"] = 1] = "error";
    LogLevelNumber[LogLevelNumber["warn"] = 2] = "warn";
    LogLevelNumber[LogLevelNumber["log"] = 3] = "log";
    LogLevelNumber[LogLevelNumber["info"] = 4] = "info";
    LogLevelNumber[LogLevelNumber["debug"] = 5] = "debug";
    LogLevelNumber[LogLevelNumber["trace"] = 6] = "trace";
})(LogLevelNumber || (LogLevelNumber = {}));
const RokuBuilderLogPrefix = '[RokuBuilder]';
function getLogLevelNumeric(logLevelName) {
    if (typeof logLevelName === 'string') {
        return LogLevelNumber[logLevelName.toLowerCase()] ?? LogLevelNumber.error;
    }
    if (typeof logLevelName === 'number') {
        let keys = Object.keys(LogLevelNumber).filter(x => LogLevelNumber[x] == logLevelName);
        return keys.length > 0 ? LogLevelNumber[keys[0]] : LogLevelNumber.error;
    }
    return LogLevelNumber.error;
}
class Logger {
    logLevel = LogLevelNumber.error;
    constructor(logLevelName = 'error') {
        this.logLevel = getLogLevelNumeric(logLevelName);
    }
    log(...params) {
        if (this.logLevel >= LogLevelNumber.log) {
            console.log(RokuBuilderLogPrefix, ...params);
        }
    }
    debug(...params) {
        if (this.logLevel >= LogLevelNumber.debug) {
            console.debug(RokuBuilderLogPrefix, ...params);
        }
    }
    error(...params) {
        if (this.logLevel >= LogLevelNumber.error) {
            console.error(RokuBuilderLogPrefix, ...params);
        }
    }
}

const im = gm.subClass({ imageMagick: '7+' });
let configData = {};
let logger = new Logger();
async function doBuild(options) {
    return new Promise(async (resolve) => {
        logger.log('Starting build...');
        if (!loadConfig(options)) {
            return;
        }
        if (options.brand) {
            logger.log(`Brand ${options.brand} requested`);
            await buildBrand(options.brand, configData, options);
            resolve();
        }
        else {
            logger.log("Brand missing, scanning config");
            const availableBrands = loadBrands(configData);
            logger.log('Available brands:', availableBrands.join(','));
            // vscode.window.showQuickPick(availableBrands).then((value: string | undefined) => {
            //   if (value) {
            //     this.buildBrand(value, this.configData);
            //   }
            //   this.closeEmitter.fire(0);
            //   resolve();
            // })
        }
    });
}
/**
 *  Loads the config file at <options.source>/.roku_builder_rebrand.json
 * @param options
 * @returns true if config loaded successfully
 */
function loadConfig(options) {
    logger = new Logger(options.logLevel ?? 'error');
    const config = path__namespace.join(options.source, ".roku_builder_rebrand.json");
    if (!fs__namespace.existsSync(config)) {
        logger.error("Roku Builder not found for", options.source);
        return false;
    }
    configData = JSON5.parse(fs__namespace.readFileSync(config).toString());
    if (!configData) {
        logger.error("Roku Builder config is invalid", options.source);
        return false;
    }
    logger.log("Config loaded", options.source);
    return true;
}
function loadBrands(configData) {
    let availableBrands = [];
    if (configData.brands) {
        Object.entries(configData.brands).forEach(([key, value]) => {
            if (!key.startsWith("!")) {
                availableBrands.push(key);
            }
        });
        if (configData.brands["!repeat_brands"]) {
            try {
                const topBrands = configData.brands["!repeat_brands"]["for"];
                topBrands.forEach((currentTopBrand) => {
                    let variables = {};
                    variables["key"] = currentTopBrand;
                    if (configData.brands["!repeat_brands"]["replace"]) {
                        let replaceVariables = configData.brands["!repeat_brands"]["replace"];
                        Object.entries(replaceVariables).forEach(([key, value]) => {
                            variables[key] = value[0];
                        });
                    }
                    const subBrands = configData.brands["!repeat_brands"]["brands"];
                    const variableRegEx = /{(\w+)}/i;
                    Object.entries(subBrands).forEach(([key, value]) => {
                        let brand = key.replace(variableRegEx, (match, g1) => {
                            logger.debug(JSON.stringify(["match", g1, variables[g1]]));
                            return variables[g1];
                        });
                        availableBrands.push(brand);
                    });
                });
            }
            catch (e) {
                logger.error('Unable to parse !repeat_brands', e.toString());
            }
        }
        else {
            logger.debug("Repeat not found");
        }
    }
    logger.debug('Available brands:', availableBrands.join(','));
    return availableBrands;
}
/**
 * Gets a entire list of brands available, with full configs
 * @param options
 * @returns
 */
function getBrandConfigs(options) {
    let brandConfigs = {};
    const requestedBrand = options.brand;
    if (configData.brands) {
        if (configData.brands[requestedBrand]) {
            logger.debug("Brand found directly, processing");
        }
        else {
            function getTargets(typedValue) {
                let targets = configData.targets ?? [];
                if (Array.isArray(typedValue?.targets)) {
                    targets = (targets).concat(typedValue.targets);
                }
                if (Array.isArray(typedValue?.["targets-override"])) {
                    targets = typedValue["targets-override"];
                }
                return targets;
            }
            function setBrandConfigData(brandName, brandConfig) {
                const key = brandName;
                brandConfigs[key]["!files"] = [];
                let targets = getTargets(brandConfig);
                let brandFolder = key;
                if (brandConfigs[key]["!variables"]) {
                    brandFolder = replaceVariables(brandConfigs[key]["manifest"]["brand"], brandConfigs[key]["!variables"]);
                }
                if (Array.isArray(targets) && targets.length > 0) {
                    const targetsGroup = (targets.length > 1 ? `{${targets.join(",")}}` : targets[0]) + `{/**/*,*}`;
                    const filePath = path__namespace.join(options.source, "brands", brandFolder, targetsGroup);
                    logger.debug(`Brand "${brandFolder}" file path:`, filePath);
                    let matches = glob__namespace.sync(filePath, { nodir: true });
                    matches.forEach((value) => {
                        let fileInfo = {
                            absoluteFilePath: value,
                            relativeFilePath: path__namespace.relative(path__namespace.join(options.source, "brands", brandFolder), value)
                        };
                        brandConfigs[key]["!files"].push(fileInfo);
                    });
                }
                else {
                    logger.error(`Brand "${brandFolder}" has no targets`);
                }
                brandConfigs[key]["!config"] = parseConfig(brandFolder, options);
            }
            Object.entries(configData.brands).forEach(([brandName, brandConfig]) => {
                if (!brandName.startsWith("!")) {
                    brandConfigs[brandName] = brandConfig;
                    setBrandConfigData(brandName, brandConfig);
                }
            });
            if (configData.brands["!repeat_brands"]) {
                try {
                    const topBrands = configData.brands["!repeat_brands"]["for"];
                    topBrands.forEach((currentTopBrand) => {
                        let variables = {};
                        variables["key"] = currentTopBrand;
                        if (configData.brands["!repeat_brands"]["replace"]) {
                            let replaceVariables = configData.brands["!repeat_brands"]["replace"];
                            Object.entries(replaceVariables).forEach(([key, value]) => {
                                variables[key] = value[0];
                            });
                        }
                        const subBrands = configData.brands["!repeat_brands"]["brands"];
                        Object.entries(subBrands).forEach(([brandNameKey, brandConfig]) => {
                            let brandName = replaceVariables(brandNameKey, variables);
                            brandConfigs[brandName] = brandConfig;
                            brandConfigs[brandName]["!variables"] = variables;
                            setBrandConfigData(brandName, brandConfig);
                        });
                    });
                    if (brandConfigs[requestedBrand]) {
                        return brandConfigs;
                        //console.log("Config completed");
                    }
                    else {
                        logger.error(`Requested brand ${requestedBrand} not found`);
                    }
                }
                catch (e) {
                    logger.error("Error", e.toString());
                }
            }
            else {
                logger.debug("Repeat not found");
            }
        }
    }
}
/**
 * Builds a brand based on the options provided
 * @param requestedBrand
 * @param configData
 * @param options
 * @returns
 */
async function buildBrand(requestedBrand, configData, options) {
    let brandConfigs = getBrandConfigs(options);
    if (!brandConfigs) {
        logger.error('Unable to load brand configs');
        return;
    }
    let finalConfig = processBrand(requestedBrand, brandConfigs);
    await finalizeBuild(finalConfig, options);
    logger.log("Build complete");
}
/**
 * Gets the completed finalized configuration for a particular brand
 * @param currentBrand
 * @param brandConfigs
 * @returns finalized config for the given brand
 */
function processBrand(currentBrandName, brandConfigs) {
    let currentBrand = brandConfigs?.[currentBrandName];
    if (!currentBrand) {
        logger.error(`No Brand "${currentBrandName}"`);
        return;
    }
    let currentConfig = {};
    logger.log(`Processing Brand "${currentBrandName}" ...`);
    if (currentBrand.parents) {
        currentBrand.parents.forEach((parentBrand) => {
            let resolvedBrand = parentBrand;
            if (currentBrand["!variables"]) {
                resolvedBrand = replaceVariables(parentBrand, currentBrand["!variables"]);
            }
            const parentConfig = processBrand(resolvedBrand, brandConfigs);
            currentConfig = mergician.mergician({ appendArrays: true })(currentConfig, parentConfig);
        });
    }
    if (currentBrand["manifest"]) {
        if (!currentConfig["manifest"]) {
            currentConfig["manifest"] = {};
        }
        Object.entries(currentBrand["manifest"]).forEach(([key, value]) => {
            if (typeof value === "string") {
                currentConfig["manifest"][key] = replaceVariables(value, currentBrand["!variables"]);
            }
            else if (typeof value === "object") {
                if (!currentConfig["manifest"][key]) {
                    currentConfig["manifest"][key] = {};
                }
                Object.entries(value).forEach(([objKey, objValue]) => {
                    currentConfig["manifest"][key][objKey] = objValue;
                });
            }
            else {
                currentConfig["manifest"][key] = value;
            }
        });
    }
    if (currentBrand["signing_key"]) {
        currentConfig["signing_key"] = replaceVariables(currentBrand["signing_key"], currentBrand["!variables"]);
    }
    if (currentBrand["targets"]) {
        currentConfig["targets"] = currentBrand["targets"];
    }
    if (currentBrand["replacements"]) {
        if (!currentConfig["replacements"]) {
            currentConfig["replacements"] = {};
        }
        Object.entries(currentBrand["replacements"]).forEach(([key, value]) => {
            currentConfig["replacements"][key] = value;
        });
    }
    if (currentBrand["replacements_files"]) {
        if (!currentConfig["replacements_files"]) {
            currentConfig["replacements_files"] = [];
        }
        currentConfig["replacements_files"] = currentConfig["replacements_files"].concat(currentBrand["replacements_files"]);
    }
    if (currentBrand["!files"]) {
        if (!currentConfig["!files"]) {
            currentConfig["!files"] = [];
        }
        currentConfig["!files"] = currentConfig["!files"].concat(currentBrand["!files"]);
    }
    if (currentBrand["!config"]) {
        if (!currentConfig["!config"]) {
            currentConfig["!config"] = {};
        }
        currentConfig["!config"] = mergician.mergician({ appendArrays: true })(currentConfig["!config"], currentBrand["!config"]);
    }
    logger.log(`Process Brand "${currentBrandName}" completed`);
    return currentConfig;
}
/**
 * Gets all the text replacements as defined by the finalConfig
 * @param finalConfig
 * @param options
 * @returns
 */
function getReplacements(finalConfig, options) {
    let replacements = finalConfig["replacements"];
    if (finalConfig["replacements_files"]) {
        finalConfig["replacements_files"].forEach((replacementFile) => {
            const filepath = path__namespace.join(options.source, replacementFile);
            if (fs__namespace.existsSync(filepath)) {
                let replacementAdd = JSON5.parse(fs__namespace.readFileSync(filepath).toString());
                Object.entries(replacementAdd).forEach(([key, value]) => {
                    if (typeof value == "string") {
                        replacements[key] = value;
                    }
                    else {
                        replacements[key] = JSON.stringify(value);
                    }
                });
            }
        });
    }
    return replacements;
}
/**
 * Writes out any animations as described in the finalConfig to the options.target directory
 * @param finalConfig
 * @param options
 */
function writeAnimations(finalConfig, options) {
    if (finalConfig["!animations"]) {
        const animTargetDir = path__namespace.join(options.target, "assets", "animations");
        fs__namespace.mkdirSync(animTargetDir, { recursive: true });
        Object.entries(finalConfig["!animations"]).forEach(([key, value]) => {
            const animFile = path__namespace.join(animTargetDir, key + ".json");
            fs__namespace.writeFileSync(animFile, JSON.stringify(value));
        });
    }
    logger.debug('Animations written');
}
/**
 * Writes out the manifest as described in the finalConfig to the options.target directory
 * @param finalConfig
 * @param options
 */
function writeManifest(finalConfig, options) {
    let manifest = "";
    Object.entries(finalConfig["manifest"]).forEach(([key, value]) => {
        let typeValue = value;
        if (typeof typeValue === "object") {
            let valueConcat = [];
            Object.entries(typeValue).forEach(([key, value]) => {
                valueConcat.push(key + "=" + value);
            });
            manifest += key + "=" + valueConcat.join(";") + "\n";
        }
        else {
            manifest += key + "=" + typeValue.toString() + "\n";
        }
    });
    manifest += "\n";
    fs__namespace.writeFileSync(path__namespace.join(options.target, "manifest"), manifest);
    logger.debug('Manifest written');
}
/**
 * Writes out the configs as described in the finalConfig to the options.target directory
 * @param finalConfig
 * @param options
 */
function writeConfig(finalConfig, options) {
    if (configData["resolutions"]) {
        let coreConfig = {};
        if (finalConfig["!config"]["core"] != undefined) {
            coreConfig = finalConfig["!config"]["core"];
        }
        (configData["resolutions"] ?? ["fhd"]).forEach((resolution) => {
            Object.entries(finalConfig["!config"]).forEach(([region, regionValue]) => {
                if (region == "core")
                    return;
                let createdConfig = {};
                createdConfig = mergician.mergician({ appendArrays: true })(createdConfig, createConfig(coreConfig, resolution));
                createdConfig = mergician.mergician({ appendArrays: true })(createdConfig, createConfig(regionValue, resolution));
                const filePath = path__namespace.join(options.target, "region", region);
                fs__namespace.mkdirSync(filePath, { recursive: true });
                Object.entries(createdConfig).forEach(([environment, environmentValue]) => {
                    fs__namespace.writeFileSync(path__namespace.join(filePath, environment + "_" + resolution + ".json"), JSON.stringify(environmentValue));
                });
            });
        });
    }
    else {
        let coreConfig = {};
        if (finalConfig["!config"]["core"] != undefined) {
            coreConfig = finalConfig["!config"]["core"];
        }
        Object.entries(finalConfig["!config"]).forEach(([region, regionValue]) => {
            let createdConfig = {};
            createdConfig = mergician.mergician({ appendArrays: true })(createdConfig, createConfig(coreConfig, "fhd"));
            createdConfig = mergician.mergician({ appendArrays: true })(createdConfig, createConfig(regionValue, "fhd"));
            const filePath = path__namespace.join(options.target, "region", region);
            fs__namespace.mkdirSync(filePath, { recursive: true });
            Object.entries(createdConfig).forEach(([environment, environmentValue]) => {
                fs__namespace.writeFileSync(path__namespace.join(filePath, environment + "_fhd.json"), JSON.stringify(environmentValue));
            });
        });
    }
    logger.debug('Config written');
}
async function processFile(sourceFile, finalConfig, replacements, options) {
    const fileInfo = path__namespace.parse(sourceFile.absoluteFilePath);
    const isTextFile = fileInfo.ext.match(/\.(brs|json|xml|txt)/i) != null;
    const isBannedFile = fileInfo.ext.match(/\.(zip)/i) != null;
    logger.debug(`Parsing File ${fileInfo.name}`, `isText:`, isTextFile, `isBanned:`, isBannedFile);
    if (isTextFile) {
        let content = fs__namespace.readFileSync(sourceFile.absoluteFilePath, { encoding: "utf-8" });
        const targetFilePath = path__namespace.join(options.target, sourceFile.relativeFilePath);
        const targetFileInfo = path__namespace.parse(targetFilePath);
        content = replaceBulk(content, Object.keys(replacements), Object.values(replacements));
        fs__namespace.mkdirSync(targetFileInfo.dir, { recursive: true });
        fs__namespace.writeFileSync(targetFilePath, content, { flag: "w" });
    }
    else if (!isBannedFile) {
        const targetFilePath = path__namespace.join(options.target, sourceFile.relativeFilePath);
        const targetFileInfo = path__namespace.parse(targetFilePath);
        const isAnimation = sourceFile.relativeFilePath.match(/^assets\/animations\/([a-z0-9\- ]+)/i);
        const isImageFile = fileInfo.ext.match(/\.(jpg|jpeg|png|webp|gif)/i) != null;
        logger.debug(`Processing File`, `isAnimation:`, isAnimation, `isBanned:`, isImageFile);
        if (isAnimation) {
            if (!finalConfig["!animations"]) {
                finalConfig["!animations"] = {};
            }
            if (!finalConfig["!animations"][isAnimation[1]]) {
                finalConfig["!animations"][isAnimation[1]] = {
                    "subtype": "Node"
                };
            }
            finalConfig["!animations"][isAnimation[1]][targetFileInfo.name.replaceAll(" ", "-")] = await processSprite(sourceFile, targetFileInfo);
        }
        else if (isImageFile) {
            logger.debug(JSON.stringify(["Image", configData?.options?.optimizeImages, targetFileInfo]));
            if ((configData?.options?.optimizeImages) && (!targetFileInfo.base.endsWith(".9.png"))) { // only optimize if enabled and not 9 patch
                fs__namespace.mkdirSync(targetFileInfo.dir, { recursive: true });
                const gmPromise = new Promise((resolve, reject) => {
                    const gmError = im(sourceFile.absoluteFilePath).write(path__namespace.join(targetFileInfo.dir, targetFileInfo.name + ".webp"), (err) => {
                        if (err) {
                            reject(err);
                            logger.error(gmError);
                        }
                        else {
                            resolve(0);
                        }
                    });
                });
                await gmPromise;
            }
            else {
                fs__namespace.mkdirSync(targetFileInfo.dir, { recursive: true });
                fs__namespace.copyFileSync(sourceFile.absoluteFilePath, targetFilePath);
            }
        }
        else {
            fs__namespace.mkdirSync(targetFileInfo.dir, { recursive: true });
            fs__namespace.copyFileSync(sourceFile.absoluteFilePath, targetFilePath);
        }
    }
}
async function finalizeBuild(finalConfig, options) {
    let replacements = getReplacements(finalConfig, options);
    logger.log('Finalizing Build...');
    if (fs__namespace.existsSync(options.target)) {
        fs__namespace.rmSync(options.target, { recursive: true });
    }
    fs__namespace.mkdirSync(options.target);
    for (const sourceFile of finalConfig["!files"]) {
        await processFile(sourceFile, finalConfig, replacements, options);
    }
    writeAnimations(finalConfig, options);
    writeManifest(finalConfig, options);
    writeConfig(finalConfig, options);
}
async function processSprite(sourceFile, targetFileInfo) {
    if (targetFileInfo.ext == ".gif") {
        try {
            const image = await new omggif__namespace.GifReader(fs__namespace.readFileSync(sourceFile.absoluteFilePath));
            let imageInfo = {
                "subtype": "Node",
                "numberOfFrames": image.numFrames(),
                "frames": []
            };
            for (let frameNum = 0; frameNum < image.numFrames(); frameNum++) {
                const imageData = Buffer.alloc(image.width * image.height * 4);
                image.decodeAndBlitFrameRGBA(frameNum, imageData);
                const gmPromise = new Promise((resolve, reject) => {
                    const test = im(sourceFile.absoluteFilePath + "[" + frameNum + "]").toBuffer('png', (err, buffer) => {
                        if (err) {
                            reject(err);
                            console.log(err.toString());
                        }
                        else {
                            resolve(buffer);
                        }
                    });
                    console.log(test);
                });
                const webpData = await gmPromise;
                imageInfo.frames.push({
                    "uri": webpData.toString("base64")
                });
            }
            return Promise.resolve(imageInfo);
        }
        catch (e) {
            logger.error('Sprite processing error', e.toString());
            return Promise.resolve(undefined);
        }
    }
    else {
        return Promise.resolve(undefined);
    }
}
function parseConfig(brand, options) {
    let config = {};
    let matches = glob__namespace.sync(path__namespace.join(options.source, "brands", brand, "region/*"));
    matches.forEach((regionPath) => {
        const region = path__namespace.relative(path__namespace.join(options.source, "brands", brand, "region"), regionPath);
        config[region] = {};
        const configPath = path__namespace.join(regionPath, "config.json");
        if (fs__namespace.existsSync(configPath)) {
            const regionConfigData = JSON5.parse(fs__namespace.readFileSync(configPath).toString());
            config[region] = regionConfigData;
            const configSections = configData["channel_config_sections"] ?? [];
            const configMatches = glob__namespace.sync(path__namespace.join(regionPath, "configs/{" + configSections.join(",") + "}/**/*"), { nodir: true });
            configMatches.forEach((regionConfigPath) => {
                const basePath = path__namespace.relative(path__namespace.join(regionPath, "configs"), regionConfigPath);
                const basePathParts = path__namespace.dirname(basePath);
                if (!config[region]["components"]) {
                    config[region]["components"] = {
                        "subType": "node"
                    };
                }
                if (!config[region]["components"][basePathParts]) {
                    config[region]["components"][basePathParts] = {};
                }
                const componentConfig = JSON5.parse(fs__namespace.readFileSync(regionConfigPath).toString());
                config[region]["components"][basePathParts] = mergician.mergician({ appendArrays: true })(config[region]["components"][basePathParts], componentConfig);
            });
        }
    });
    return config;
}
function createConfig(config, resolution) {
    let createdConfig = {};
    createdConfig["production"] = createConfigSection(config, resolution, "production");
    createdConfig["staging"] = createConfigSection(config, resolution, "staging");
    return createdConfig;
}
function createConfigSection(section, resolution, environment) {
    let createdSection;
    if (Array.isArray(section)) {
        createdSection = [];
        section.forEach((value, index) => {
            createdSection[index] = createConfigSection(value, resolution, environment);
        });
    }
    else if (typeof section === "object") {
        if (section[resolution] != undefined) {
            createdSection = createConfigSection(section[resolution], resolution, environment);
        }
        else if (section[environment] != undefined) {
            createdSection = createConfigSection(section[environment], resolution, environment);
        }
        else {
            createdSection = {};
            Object.entries(section).forEach(([componentKey, componentValue]) => {
                createdSection[componentKey] = createConfigSection(componentValue, resolution, environment);
            });
        }
    }
    else {
        createdSection = section;
    }
    return createdSection;
}
function replaceVariables(original, variables) {
    if (variables) {
        return original.replace(/{(\w+)}/ig, (match, g1) => {
            if (variables[g1]) {
                return variables[g1];
            }
            else {
                return "{" + g1 + "}";
            }
        });
    }
    else {
        return original;
    }
}
/**
 * Replaces in `str` all the instances of each member of findArray with the same index of replaceArray
 * @returns the converted string
 */
function replaceBulk(str, findArray, replaceArray) {
    var i, regex = [], map = {};
    for (i = 0; i < findArray.length; i++) {
        regex.push(findArray[i].replace(/([-[\]{}()*+?.\\^$|#,])/g, '\\$1'));
        map[findArray[i]] = replaceArray[i];
    }
    let regexStr = regex.join('|');
    str = str.replace(new RegExp(regexStr, 'g'), function (matched) {
        return map[matched];
    });
    return str;
}

exports.doBuild = doBuild;
exports.getBrandConfigs = getBrandConfigs;
exports.getReplacements = getReplacements;
exports.loadBrands = loadBrands;
exports.loadConfig = loadConfig;
exports.processBrand = processBrand;
exports.replaceBulk = replaceBulk;
exports.writeAnimations = writeAnimations;
exports.writeConfig = writeConfig;
exports.writeManifest = writeManifest;
