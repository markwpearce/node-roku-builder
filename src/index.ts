import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import JSON5 from 'json5'
import * as omggif from 'omggif';
import gm from 'gm';
import { mergician } from 'mergician';
import { LogLevel, Logger } from './logger.js';

const im = gm.subClass({ imageMagick: '7+' });

export interface Dictionary<Type> {
  [key: string]: Type;
}

export interface RokuBuilderFileInfo {
  relativeFilePath: string;
  absoluteFilePath: string;
}

export interface RokuBuilderGlobInfo {
  src: string;
  dest: string;
}

export interface Options {
  source: string
  target: string
  brand: string
  logLevel?: LogLevel
}

export interface FinalConfig {
  manifest?: {
    bs_const: Dictionary<boolean>;
    [key: string]: any;
  },
  replacements?: Dictionary<string>;
  '!files'?: RokuBuilderFileInfo[];
  '!globs'?: RokuBuilderGlobInfo[];
  '!config'?: Dictionary<Dictionary<any>>;
  replacements_files?: string[];
  [key: string]: any;
  resolutions?: string[];
}

let configData: Dictionary<any> = {};
let logger: Logger = new Logger();

async function doBuild(options: Options): Promise<void> {
  return new Promise<void>(async (resolve) => {
    logger.log('Starting build...');

    if (!loadConfig(options)) {
      return;
    }

    if (options.brand) {
      logger.log(`Brand ${options.brand} requested`);
      await buildBrand(options.brand, configData, options);

      resolve();
    } else {
      logger.log("Brand missing, scanning config");
      const availableBrands: Array<string> = loadBrands(configData);

      logger.log('Available brands:', availableBrands.join(','));

      // vscode.window.showQuickPick(availableBrands).then((value: string | undefined) => {
      //   if (value) {
      //     this.buildBrand(value, this.configData);
      //   }

      //   this.closeEmitter.fire(0);
      //   resolve();
      // })
    }
  })
}

/**
 *  Loads the config file at <options.source>/.roku_builder_rebrand.json
 * @param options
 * @returns true if config loaded successfully
 */
function loadConfig(options: Options): boolean {

  logger = new Logger(options.logLevel ?? 'error');
  const config = path.join(options.source, ".roku_builder_rebrand.json");
  let availableBrands: Array<string> = []

  if (!fs.existsSync(config)) {
    logger.error("Roku Builder not found for", options.source);
    return false;
  }

  configData = JSON5.parse(fs.readFileSync(config).toString());

  if (!configData) {
    logger.error("Roku Builder config is invalid", options.source);
    return false;
  }

  logger.log("Config loaded", options.source);
  return true;
}

function loadBrands(configData: Dictionary<any>): Array<string> {
  let availableBrands: Array<string> = [];

  if (configData.brands) {
    Object.entries(configData.brands).forEach(([key, value]) => {
      if (!key.startsWith("!")) {
        availableBrands.push(key);
      }
    });

    if (configData.brands["!repeat_brands"]) {
      try {
        const topBrands = configData.brands["!repeat_brands"]["for"];

        topBrands.forEach((currentTopBrand: string) => {
          let variables: Dictionary<string> = {};

          variables["key"] = currentTopBrand;
          if (configData.brands["!repeat_brands"]["replace"]) {
            let replaceVariables: Dictionary<any> = configData.brands["!repeat_brands"]["replace"];

            Object.entries(replaceVariables).forEach(([key, value]) => {
              variables[key] = value[0]
            })
          }

          const subBrands = configData.brands["!repeat_brands"]["brands"];
          const variableRegEx = /{(\w+)}/i

          Object.entries(subBrands).forEach(([key, value]) => {
            let brand = key.replace(variableRegEx, (match, g1) => {
              logger.debug(JSON.stringify(["match", g1, variables[g1]]));
              return variables[g1]
            })

            availableBrands.push(brand);
          })
        })
      } catch (e) {
        logger.error('Unable to parse !repeat_brands', e.toString())
      }
    } else {
      logger.debug("Repeat not found")
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
function getBrandConfigs(options: Options): Dictionary<any> {
  let brandConfigs: Dictionary<any> = {};
  const requestedBrand = options.brand

  if (configData.brands) {
    if (configData.brands[requestedBrand]) {
      logger.debug("Brand found directly, processing")
    } else {

      function getTargets(typedValue: { targets?: Array<any> }): string[] {
        let targets = configData.targets ?? [];
        if (Array.isArray(typedValue?.targets)) {
          targets = (targets).concat(typedValue.targets);
        }
        if (Array.isArray(typedValue?.["targets-override"])) {
          targets = typedValue["targets-override"];
        };
        return targets;
      }


      function setBrandConfigData(brandName: string, brandConfig: Dictionary<any>) {
        const key = brandName;

        brandConfigs[key]["!files"] = [];
        brandConfigs[key]["!globs"] = [];
        let targets = getTargets(brandConfig);
        let brandFolder = key;
        if (brandConfigs[key]["!variables"]) {
          brandFolder = replaceVariables(brandConfigs[key]["manifest"]["brand"], brandConfigs[key]["!variables"]);
        }

        const allFilesGlobSuffix = `{/**/*,*}`;

        if (Array.isArray(targets) && targets.length > 0) {
          // build globs
          for (const target of targets) {
            let globPath = path.join(options.source, "brands", brandFolder, target);

            if (fs.existsSync(globPath)) {
              const stats = fs.lstatSync(globPath);
              if (stats.isFile()) {
                brandConfigs[key]["!globs"].push({
                  src: globPath,
                  dest: path.join(target)
                });
              } else if (stats.isDirectory()) {
                globPath = path.join(globPath, '/**/*.*')
                brandConfigs[key]["!globs"].push({
                  src: globPath,
                  dest: path.join(target)
                });
              }
              logger.debug(`Brand "${brandFolder}" glob path:`, globPath)
            }
          }
          const targetsGroup = (targets.length > 1 ? `{${targets.join(",")}}` : targets[0]) + allFilesGlobSuffix;
          const filePath = path.join(options.source, "brands", brandFolder, targetsGroup);
          logger.debug(`Brand "${brandFolder}" file path:`, filePath)
          let matches = glob.sync(filePath, { nodir: true });
          matches.forEach((value) => {
            let fileInfo = {
              absoluteFilePath: value,
              relativeFilePath: path.relative(path.join(options.source, "brands", brandFolder), value)
            };
            brandConfigs[key]["!files"].push(fileInfo);
          })
        } else {
          logger.error(`Brand "${brandFolder}" has no targets`);
        }

        brandConfigs[key]["!config"] = parseConfig(brandFolder, options);
      }


      Object.entries(configData.brands).forEach(([brandName, brandConfig]) => {
        if (!brandName.startsWith("!")) {
          brandConfigs[brandName] = brandConfig
          setBrandConfigData(brandName, brandConfig as Dictionary<any>);
        }
      });

      if (configData.brands["!repeat_brands"]) {
        try {
          const topBrands = configData.brands["!repeat_brands"]["for"];

          topBrands.forEach((currentTopBrand: string) => {
            let variables: Dictionary<string> = {};

            variables["key"] = currentTopBrand;
            if (configData.brands["!repeat_brands"]["replace"]) {
              let replaceVariables: Dictionary<any> = configData.brands["!repeat_brands"]["replace"];

              Object.entries(replaceVariables).forEach(([key, value]) => {
                variables[key] = value[0]
              })
            }

            const subBrands = configData.brands["!repeat_brands"]["brands"];

            Object.entries(subBrands).forEach(([brandNameKey, brandConfig]) => {
              let brandName = replaceVariables(brandNameKey, variables);
              brandConfigs[brandName] = brandConfig
              brandConfigs[brandName]["!variables"] = variables;
              setBrandConfigData(brandName, brandConfig as Dictionary<any>);
            })
          })

          if (brandConfigs[requestedBrand]) {

            return brandConfigs;
            //console.log("Config completed");
          } else {
            logger.error(`Requested brand ${requestedBrand} not found`);
          }
        } catch (e) {
          logger.error("Error", e.toString())
        }
      } else {
        logger.debug("Repeat not found")
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
async function buildBrand(requestedBrand: string, configData: any, options: Options) {
  let brandConfigs: Dictionary<any> = getBrandConfigs(options)

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
function processBrand(currentBrandName: string, brandConfigs: Dictionary<any>): FinalConfig {
  let currentBrand = brandConfigs?.[currentBrandName];
  if (!currentBrand) {
    logger.error(`No Brand "${currentBrandName}"`);
    return;
  }
  let currentConfig: Dictionary<any> = {};
  logger.log(`Processing Brand "${currentBrandName}" ...`);

  if (currentBrand.parents) {
    currentBrand.parents.forEach((parentBrand: string) => {
      let resolvedBrand: string = parentBrand;
      if (currentBrand["!variables"]) {
        resolvedBrand = replaceVariables(parentBrand, currentBrand["!variables"])
      }
      const parentConfig: Dictionary<any> = processBrand(resolvedBrand, brandConfigs);
      currentConfig = mergician({ appendArrays: true })(currentConfig, parentConfig)
    })
  }

  if (currentBrand["manifest"]) {
    if (!currentConfig["manifest"]) {
      currentConfig["manifest"] = {}
    }

    Object.entries(currentBrand["manifest"]).forEach(([key, value]) => {
      if (typeof value === "string") {
        currentConfig["manifest"][key] = replaceVariables(<string>value, currentBrand["!variables"])
      } else if (typeof value === "object") {
        if (!currentConfig["manifest"][key]) {
          currentConfig["manifest"][key] = {}
        }
        Object.entries(<object>value).forEach(([objKey, objValue]) => {
          currentConfig["manifest"][key][objKey] = objValue;
        })
      } else {
        currentConfig["manifest"][key] = value;
      }
    });
  }

  if (currentBrand["signing_key"]) {
    currentConfig["signing_key"] = replaceVariables(currentBrand["signing_key"], currentBrand["!variables"])
  }

  if (currentBrand["targets"]) {
    currentConfig["targets"] = currentBrand["targets"]
  }

  if (currentBrand["replacements"]) {
    if (!currentConfig["replacements"]) {
      currentConfig["replacements"] = {}
    }

    Object.entries(currentBrand["replacements"]).forEach(([key, value]) => {
      currentConfig["replacements"][key] = value
    })
  }

  if (currentBrand["replacements_files"]) {
    if (!currentConfig["replacements_files"]) {
      currentConfig["replacements_files"] = []
    }
    currentConfig["replacements_files"] = currentConfig["replacements_files"].concat(currentBrand["replacements_files"])
  }

  if (currentBrand["!files"]) {
    if (!currentConfig["!files"]) {
      currentConfig["!files"] = []
    }

    currentConfig["!files"] = currentConfig["!files"].concat(currentBrand["!files"])
  }

  if (currentBrand["!globs"]) {
    if (!currentConfig["!globs"]) {
      currentConfig["!globs"] = []
    }

    currentConfig["!globs"] = currentConfig["!globs"].concat(currentBrand["!globs"])
  }

  if (currentBrand["!config"]) {
    if (!currentConfig["!config"]) {
      currentConfig["!config"] = {}
    }
    currentConfig["!config"] = mergician({ appendArrays: true })(currentConfig["!config"], currentBrand["!config"])
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
function getReplacements(finalConfig: FinalConfig, options: Options) {
  let replacements = finalConfig["replacements"];

  if (finalConfig["replacements_files"]) {
    finalConfig["replacements_files"].forEach((replacementFile: string) => {
      const filepath = path.join(options.source, replacementFile);
      if (fs.existsSync(filepath)) {
        let replacementAdd = JSON5.parse(fs.readFileSync(filepath).toString());

        Object.entries(replacementAdd).forEach(([key, value]) => {
          if (typeof value == "string") {
            replacements[key] = value
          } else {
            replacements[key] = JSON.stringify(value)
          }
        })
      }
    })
  }
  return replacements;
}

/**
 * Writes out any animations as described in the finalConfig to the options.target directory
 * @param finalConfig
 * @param options
 */
function writeAnimations(finalConfig: FinalConfig, options: Options) {
  if (finalConfig["!animations"]) {
    const animTargetDir = path.join(options.target, "assets", "animations")
    fs.mkdirSync(animTargetDir, { recursive: true });
    Object.entries(finalConfig["!animations"]).forEach(([key, value]) => {
      const animFile = path.join(animTargetDir, key + ".json")
      fs.writeFileSync(animFile, JSON.stringify(value))
    })
  }
  logger.debug('Animations written')
}

/**
 * Writes out the manifest as described in the finalConfig to the options.target directory
 * @param finalConfig
 * @param options
 */
function writeManifest(finalConfig: FinalConfig, options: Options) {
  let manifest: string = ""

  Object.entries(finalConfig["manifest"]).forEach(([key, value]) => {
    let typeValue: any = value;

    if (typeof typeValue === "object") {
      let valueConcat: string[] = [];

      Object.entries(typeValue).forEach(([key, value]) => {
        valueConcat.push(key + "=" + value)
      })
      manifest += key + "=" + valueConcat.join(";") + "\n";
    } else {
      manifest += key + "=" + typeValue.toString() + "\n"
    }
  })
  manifest += "\n"
  fs.writeFileSync(path.join(options.target, "manifest"), manifest)
  logger.debug('Manifest written')
}

/**
 * Writes out the configs as described in the finalConfig to the options.target directory
 * @param finalConfig
 * @param options
 */
function writeConfig(finalConfig: FinalConfig, options: Options) {
  if (configData["resolutions"]) {
    let coreConfig: Dictionary<any> = {}

    if (finalConfig["!config"]["core"] != undefined) {
      coreConfig = finalConfig["!config"]["core"];
    }

    (configData["resolutions"] ?? ["fhd"]).forEach((resolution: string) => {
      Object.entries(finalConfig["!config"]).forEach(([region, regionValue]) => {
        if (region == "core")
          return;
        let createdConfig: Dictionary<any> = {}
        createdConfig = mergician({ appendArrays: true })(createdConfig, createConfig(coreConfig, resolution))
        createdConfig = mergician({ appendArrays: true })(createdConfig, createConfig(<Dictionary<any>>regionValue, resolution))

        const filePath = path.join(options.target, "region", region)

        fs.mkdirSync(filePath, { recursive: true });
        Object.entries(createdConfig).forEach(([environment, environmentValue]) => {
          fs.writeFileSync(path.join(filePath, environment + "_" + resolution + ".json"), JSON.stringify(environmentValue));
        })
      })
    })
  } else {
    let coreConfig: Dictionary<any> = {}

    if (finalConfig["!config"]["core"] != undefined) {
      coreConfig = finalConfig["!config"]["core"];
    }

    Object.entries(finalConfig["!config"]).forEach(([region, regionValue]) => {
      let createdConfig: Dictionary<any> = {}
      createdConfig = mergician({ appendArrays: true })(createdConfig, createConfig(coreConfig, "fhd"))
      createdConfig = mergician({ appendArrays: true })(createdConfig, createConfig(<Dictionary<any>>regionValue, "fhd"))

      const filePath = path.join(options.target, "region", region)

      fs.mkdirSync(filePath, { recursive: true });

      Object.entries(createdConfig).forEach(([environment, environmentValue]) => {
        fs.writeFileSync(path.join(filePath, environment + "_fhd.json"), JSON.stringify(environmentValue));
      })
    })
  }
  logger.debug('Config written')
}

async function processFile(sourceFile: RokuBuilderFileInfo, finalConfig: FinalConfig, replacements: Dictionary<string>, options: Options) {
  const fileInfo = path.parse(sourceFile.absoluteFilePath);
  const isTextFile = fileInfo.ext.match(/\.(brs|json|xml|txt)/i) != null
  const isBannedFile = fileInfo.ext.match(/\.(zip)/i) != null

  logger.debug(`Parsing File ${fileInfo.name}`, `isText:`, isTextFile, `isBanned:`, isBannedFile);

  if (isTextFile) {
    let content = fs.readFileSync(sourceFile.absoluteFilePath, { encoding: "utf-8" });
    const targetFilePath = path.join(options.target, sourceFile.relativeFilePath);
    const targetFileInfo = path.parse(targetFilePath)

    content = replaceBulk(content, Object.keys(replacements), Object.values(replacements))

    fs.mkdirSync(targetFileInfo.dir, { recursive: true });
    fs.writeFileSync(targetFilePath, content, { flag: "w" });
  } else if (!isBannedFile) {
    const targetFilePath = path.join(options.target, sourceFile.relativeFilePath);
    const targetFileInfo = path.parse(targetFilePath)
    const isAnimation = sourceFile.relativeFilePath.match(/^assets\/animations\/([a-z0-9\- ]+)/i)
    const isImageFile = fileInfo.ext.match(/\.(jpg|jpeg|png|webp|gif)/i) != null

    logger.debug(`Processing File`, `isAnimation:`, isAnimation, `isBanned:`, isImageFile);

    if (isAnimation) {
      if (!finalConfig["!animations"]) {
        finalConfig["!animations"] = {}
      }
      if (!finalConfig["!animations"][isAnimation[1]]) {
        finalConfig["!animations"][isAnimation[1]] = {
          "subtype": "Node"
        }
      }
      finalConfig["!animations"][isAnimation[1]][targetFileInfo.name.replaceAll(" ", "-")] = await processSprite(sourceFile, targetFileInfo)
    } else if (isImageFile) {
      logger.debug(JSON.stringify(["Image", configData?.options?.optimizeImages, targetFileInfo]))
      if ((configData?.options?.optimizeImages) && (!targetFileInfo.base.endsWith(".9.png"))) { // only optimize if enabled and not 9 patch
        fs.mkdirSync(targetFileInfo.dir, { recursive: true });

        const gmPromise = new Promise((resolve, reject) => {
          const gmError = im(sourceFile.absoluteFilePath).write(path.join(targetFileInfo.dir, targetFileInfo.name + ".webp"), (err: String) => {
            if (err) {
              reject(err)
              logger.error(gmError);
            } else {
              resolve(0)
            }
          })
        })
        await gmPromise;
      } else {
        fs.mkdirSync(targetFileInfo.dir, { recursive: true });
        fs.copyFileSync(sourceFile.absoluteFilePath, targetFilePath)
      }
    } else {
      fs.mkdirSync(targetFileInfo.dir, { recursive: true });
      fs.copyFileSync(sourceFile.absoluteFilePath, targetFilePath)
    }
  }
}



async function finalizeBuild(finalConfig: FinalConfig, options: Options) {
  let replacements = getReplacements(finalConfig, options);
  logger.log('Finalizing Build...')
  if (fs.existsSync(options.target)) {
    fs.rmSync(options.target, { recursive: true })
  }
  fs.mkdirSync(options.target);

  for (const sourceFile of finalConfig["!files"]) {
    await processFile(sourceFile, finalConfig, replacements, options)
  }

  writeAnimations(finalConfig, options);

  writeManifest(finalConfig, options);

  writeConfig(finalConfig, options);
}


async function processSprite(sourceFile: RokuBuilderFileInfo, targetFileInfo: path.ParsedPath): Promise<Dictionary<any> | undefined> {
  if (targetFileInfo.ext == ".gif") {
    try {
      const image = await new omggif.GifReader(fs.readFileSync(sourceFile.absoluteFilePath))
      let imageInfo = {
        "subtype": "Node",
        "numberOfFrames": image.numFrames(),
        "frames": [] as Array<any>
      }

      for (let frameNum = 0; frameNum < image.numFrames(); frameNum++) {
        const imageData = Buffer.alloc(image.width * image.height * 4)
        image.decodeAndBlitFrameRGBA(frameNum, imageData)

        const gmPromise = new Promise((resolve, reject) => {
          const test = im(sourceFile.absoluteFilePath + "[" + frameNum + "]").toBuffer('png', (err: String, buffer: Buffer) => {
            if (err) {
              reject(err)
              console.log(err.toString())
            } else {
              resolve(buffer)
            }
          })
          console.log(test);
        })
        const webpData = <Buffer>await gmPromise;

        imageInfo.frames.push({
          "uri": webpData.toString("base64")
        })
      }

      return Promise.resolve(imageInfo)
    } catch (e) {
      logger.error('Sprite processing error', e.toString())
      return Promise.resolve(undefined);
    }
  } else {
    return Promise.resolve(undefined)
  }
}

function parseConfig(brand: string, options: Options): Dictionary<any> {
  let config: Dictionary<any> = {}
  let matches = glob.sync(path.join(options.source, "brands", brand, "region/*"))
  matches.forEach((regionPath) => {
    const region = path.relative(path.join(options.source, "brands", brand, "region"), regionPath)
    config[region] = {}

    const configPath = path.join(regionPath, "config.json")

    if (fs.existsSync(configPath)) {
      const regionConfigData = JSON5.parse(fs.readFileSync(configPath).toString());

      config[region] = regionConfigData;

      const configSections = configData["channel_config_sections"] ?? [];
      const configMatches = glob.sync(path.join(regionPath, "configs/{" + configSections.join(",") + "}/**/*"), { nodir: true })
      configMatches.forEach((regionConfigPath) => {
        const basePath = path.relative(path.join(regionPath, "configs"), regionConfigPath)
        const basePathParts = path.dirname(basePath);

        if (!config[region]["components"]) {
          config[region]["components"] = {
            "subType": "node"
          }
        }

        if (!config[region]["components"][basePathParts]) {
          config[region]["components"][basePathParts] = {}
        }

        const componentConfig = JSON5.parse(fs.readFileSync(regionConfigPath).toString());
        config[region]["components"][basePathParts] = mergician({ appendArrays: true })(config[region]["components"][basePathParts], componentConfig)
      })
    }
  })

  return config
}

function createConfig(config: Dictionary<any>, resolution: string): Dictionary<any> {
  let createdConfig: Dictionary<any> = {}

  createdConfig["production"] = createConfigSection(config, resolution, "production")
  createdConfig["staging"] = createConfigSection(config, resolution, "staging")

  return createdConfig
}

function createConfigSection(section: any, resolution: string, environment: string): any {
  let createdSection: any;

  if (Array.isArray(section)) {
    createdSection = []
    section.forEach((value: any, index: number) => {
      createdSection[index] = createConfigSection(value, resolution, environment);
    })
  } else if (typeof section === "object") {
    if (section[resolution] != undefined) {
      createdSection = createConfigSection(section[resolution], resolution, environment);
    } else if (section[environment] != undefined) {
      createdSection = createConfigSection(section[environment], resolution, environment);
    } else {
      createdSection = {}
      Object.entries(section).forEach(([componentKey, componentValue]) => {
        createdSection[componentKey] = createConfigSection(componentValue, resolution, environment);
      })
    }
  } else {
    createdSection = section
  }

  return createdSection;
}

function replaceVariables(original: string, variables: Dictionary<string>): string {
  if (variables) {
    return original.replace(/{(\w+)}/ig, (match, g1) => {
      if (variables[g1]) {
        return variables[g1]
      } else {
        return "{" + g1 + "}"
      }
    })
  } else {
    return original;
  }
}

/**
 * Replaces in `str` all the instances of each member of findArray with the same index of replaceArray
 * @returns the converted string
 */
function replaceBulk(str: string, findArray: string[], replaceArray: string[]): string {
  var i, regex: string[] = [], map: Dictionary<any> = {};
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

export {
  doBuild,
  loadConfig,
  loadBrands,
  getBrandConfigs,
  processBrand,
  getReplacements,
  writeAnimations,
  writeManifest,
  writeConfig,
  replaceBulk,
  LogLevel
}