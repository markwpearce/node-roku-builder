import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import JSON5 from 'json5'
import * as omggif from 'omggif';
import gm from 'gm';

const im = gm.subClass({ imageMagick: '7+' });

interface Dictionary<Type> {
  [key: string]: Type;
}

interface rokuBuilderFileInfo {
  relativeFilePath: string;
  absoluteFilePath: string;
}

interface Options {
  source: string
  target: string
  brand: string
}

let configData: Dictionary<any> = {};

async function doBuild(options: Options): Promise<void> {
  return new Promise<void>(async (resolve) => {
    console.log('Starting build...\r\n');

    const config = path.join(options.source, ".roku_builder_rebrand.json");
    let availableBrands: Array<string> = []

    if (!fs.existsSync(config)) {
      console.log(JSON.stringify(["Roku Builder not found for", options.source]));
      return;
    }

    configData = JSON5.parse(fs.readFileSync(config).toString());

    if (!configData) {
      console.log(JSON.stringify(["Roku Builder config is invalid", options.source]));
      return;
    }

    console.log(JSON.stringify(["Config loaded"]));

    if (options.brand) {
      console.log(`Brand ${options.brand} requested`);
      await buildBrand(options.brand, configData, options);

      resolve();
    } else {
      console.log("Brand missing, scanning config");
      const availableBrands: Array<string> = loadBrands(configData);

      console.log(availableBrands);

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
              console.log(JSON.stringify(["match", g1, variables[g1]]));
              return variables[g1]
            })

            availableBrands.push(brand);
          })
        })
      } catch(e) {
        console.log(e.toString())
      }
    } else {
      console.log("Repeat not found")
    }
  }

  console.log(JSON.stringify(availableBrands));

  return availableBrands;
}

async function buildBrand(requestedBrand: string, configData: any, options: Options) {
  let brandConfigs: Dictionary<any> = {};

  if (configData.brands) {
    if (configData.brands[requestedBrand]) {
      console.log("Brand found directly, processing")
    } else {
      let targets = configData.targets;
      Object.entries(configData.brands).forEach(([key, value]) => {
        if (!key.startsWith("!")) {
          const typedValue: Dictionary<any> = <Dictionary<any>>value;

          if (typedValue.targets) {
            targets = configData.targets.concat(typedValue.targets)
          }
          brandConfigs[key] = value;
          brandConfigs[key]["!files"] = [];

          let matches = glob.sync(path.join(options.source, "brands", key, "{" + targets.join(",") + "}{/**/*,*}"), { nodir: true })
          matches.forEach((value) => {
            let fileInfo: rokuBuilderFileInfo = {
              absoluteFilePath: value,
              relativeFilePath: path.relative(path.join(options.source, "brands", key), value)
            };

            brandConfigs[key]["!files"].push(fileInfo);
          })

          brandConfigs[key]["!config"] = parseConfig(key, options);
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

            Object.entries(subBrands).forEach(([key, value]) => {
              let brand = replaceVariables(key, variables);
              let targets = configData.targets;
              const typedValue: Dictionary<any> = <Dictionary<any>>value;

              if (typedValue.targets) {
                targets = configData.targets.concat(typedValue.targets)
              }

              brandConfigs[brand] = value
              brandConfigs[brand]["!variables"] = variables;
              brandConfigs[brand]["!files"] = [];

              const matches = glob.sync(path.join(options.source, "brands", brand, "{" + targets.join(",") + "}{/**/*,*}"), { nodir: true })
              matches.forEach((value) => {
                let fileInfo: rokuBuilderFileInfo = {
                  absoluteFilePath: value,
                  relativeFilePath: path.relative(path.join(options.source, "brands", brand), value)
                };

                brandConfigs[brand]["!files"].push(fileInfo);
              })

              brandConfigs[brand]["!config"] = parseConfig(brand, options);
            })
          })

          if (brandConfigs[requestedBrand]) {
            let finalConfig: Dictionary<any> = processBrand(brandConfigs[requestedBrand], brandConfigs);

            await finalizeBuild(finalConfig, options);


            console.log("Config completed");
          } else {
            console.log(`Requested brand ${requestedBrand} not found`);
          }
        } catch (e) {
          console.log(JSON.stringify(["Error", e.toString()]))
        }
      } else {
        console.log("Repeat not found")
      }
    }
  }
}

function processBrand(currentBrand: Dictionary<any>, brandConfigs: Dictionary<any>): Dictionary<any> {
  let currentConfig: Dictionary<any> = {};

  if (currentBrand.parents) {
    currentBrand.parents.forEach((parentBrand: string) => {
      let resolvedBrand: string = parentBrand;
      if (currentBrand["!variables"]) {
        resolvedBrand = replaceVariables(parentBrand, currentBrand["!variables"])
      }
      const parentConfig: Dictionary<any> = processBrand(brandConfigs[resolvedBrand], brandConfigs);
      Object.entries(parentConfig).forEach(([key, value]) => {
        if (currentConfig[key] != undefined) {
          currentConfig[key] = Object.assign(currentConfig[key], value)
        } else {
          currentConfig[key] = value
        }
      })
    })
  }

  if (currentBrand["manifest"]) {
    if (!currentConfig["manifest"]) {
      currentConfig["manifest"] = {}
    }

    Object.entries(currentBrand["manifest"]).forEach(([key, value]) => {
      if (typeof value  === "string") {
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

    Object.entries(currentBrand["!files"]).forEach(([key, value]) => {
      value as rokuBuilderFileInfo
      currentConfig["!files"].push(value);
    });
  }

  if (currentBrand["!config"]) {
    if (!currentConfig["!config"]) {
      currentConfig["!config"] = {}
    }

    Object.entries(currentBrand["!config"]).forEach(([key, value]) => {
      currentConfig["!config"][key] = value;
    });
  }

  console.log("Process Brand completed");

  return currentConfig;
}

async function finalizeBuild(finalConfig: Dictionary<any>, options: Options) {
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

  if (fs.existsSync(options.target)) {
    fs.rmSync(options.target, {recursive: true})
  }
  fs.mkdirSync(options.target);

  for (const sourceFile of finalConfig["!files"]) {
    const fileInfo = path.parse(sourceFile.absoluteFilePath);
    const isTextFile = fileInfo.ext.match(/\.(brs|json|xml|txt)/i) != null
    const isBannedFile = fileInfo.ext.match(/\.(zip)/i) != null

    console.log(`Parsing File ${fileInfo.name} ${isTextFile} ${isBannedFile}`)

    if (isTextFile) {
      let content = fs.readFileSync(sourceFile.absoluteFilePath, {encoding: "utf-8"});
      const targetFilePath = path.join(options.target, sourceFile.relativeFilePath);
      const targetFileInfo = path.parse(targetFilePath)

      content = replaceBulk(content, Object.keys(replacements), Object.values(replacements))

      fs.mkdirSync(targetFileInfo.dir, {recursive: true});
      fs.writeFileSync(targetFilePath, content, {flag: "w"});
    } else if (!isBannedFile) {
      const targetFilePath = path.join(options.target, sourceFile.relativeFilePath);
      const targetFileInfo = path.parse(targetFilePath)
      const isAnimation = sourceFile.relativeFilePath.match(/^assets\/animations\/([a-z0-9\- ]+)/i)
      const isImageFile = fileInfo.ext.match(/\.(jpg|jpeg|png|webp|gif)/i) != null

      console.log(`Processing File ${isAnimation} ${isImageFile}`)

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
        console.log(JSON.stringify(["Image", configData?.options?.optimizeImages, targetFileInfo]))
        if ( (configData?.options?.optimizeImages) && (!targetFileInfo.base.endsWith(".9.png")) ) { // only optimize if enabled and not 9 patch
          fs.mkdirSync(targetFileInfo.dir, {recursive: true});

          const gmPromise = new Promise((resolve, reject) => {
            const gmError = im(sourceFile.absoluteFilePath).write(path.join(targetFileInfo.dir, targetFileInfo.name + ".webp"), (err: String) => {
              if (err) {
                reject(err)
                console.log(gmError);
              } else {
                resolve(0)
              }
            })
          })
          await gmPromise;
        } else {
          fs.mkdirSync(targetFileInfo.dir, {recursive: true});
          fs.copyFileSync(sourceFile.absoluteFilePath, targetFilePath)
        }
      } else {
        fs.mkdirSync(targetFileInfo.dir, {recursive: true});
        fs.copyFileSync(sourceFile.absoluteFilePath, targetFilePath)
      }
    }
  }

  if (finalConfig["!animations"]) {
    const animTargetDir = path.join(options.target, "assets", "animations")
    fs.mkdirSync(animTargetDir, {recursive: true});
    Object.entries(finalConfig["!animations"]).forEach(([key, value]) => {
      const animFile = path.join(animTargetDir, key + ".json")
      fs.writeFileSync(animFile, JSON.stringify(value))
    })
  }

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

  if (configData["resolutions"]) {
    configData["resolutions"].forEach((resolution: string) => {
      Object.entries(finalConfig["!config"]).forEach(([region, regionValue]) => {
        const createdConfig = createConfig(<Dictionary<any>>regionValue, resolution)
        const filePath = path.join(options.target, "region", region)

        fs.mkdirSync(filePath, {recursive: true});
        Object.entries(createdConfig).forEach(([environment, environmentValue]) => {
          fs.writeFileSync(path.join(filePath, environment + "_" + resolution + ".json"), JSON.stringify(environmentValue));
        })
      })
    })
  } else {
    Object.entries(finalConfig["!config"]).forEach(([region, regionValue]) => {
      const createdConfig = createConfig(<Dictionary<any>>regionValue, "fhd")
      const filePath = path.join(options.target, "region", region)

      fs.mkdirSync(filePath, {recursive: true});

      Object.entries(createdConfig).forEach(([environment, environmentValue]) => {
        fs.writeFileSync(path.join(filePath, environment + "_fhd.json"), JSON.stringify(environmentValue));
      })
    })
  }
}

async function processSprite(sourceFile: rokuBuilderFileInfo, targetFileInfo: path.ParsedPath): Promise<Dictionary<any> | undefined> {
  if (targetFileInfo.ext == ".gif") {
    try {
      const image = await new omggif.GifReader(fs.readFileSync(sourceFile.absoluteFilePath))
      let imageInfo = {
          "subtype": "Node",
          "numberOfFrames": image.numFrames(),
          "frames": [] as Array<any>
      }

      for (let frameNum=0;frameNum<image.numFrames();frameNum++) {
        const imageData = Buffer.alloc(image.width * image.height * 4)
        image.decodeAndBlitFrameRGBA(frameNum, imageData)

        const gmPromise = new Promise((resolve, reject) => {
          const test = im(sourceFile.absoluteFilePath+"["+frameNum+"]").toBuffer('png', (err: String, buffer: Buffer) => {
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
    } catch(e) {
      console.log(e.toString())
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

      const configSections = configData["channel_config_sections"];
      const configMatches = glob.sync(path.join(regionPath, "configs/{" + configSections.join(",") + "}/**/*"), {nodir: true})
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

        Object.entries(componentConfig).forEach(([componentKey, componentValue]) => {
          config[region]["components"][basePathParts][componentKey] = componentValue
        })
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

function replaceBulk( str: string, findArray: string[], replaceArray: string[]): string {
  var i, regex: string[] = [], map: Dictionary<any> = {}; 
  for( i=0; i<findArray.length; i++ ){ 
    regex.push( findArray[i].replace(/([-[\]{}()*+?.\\^$|#,])/g,'\\$1') );
    map[findArray[i]] = replaceArray[i]; 
  }
  let regexStr = regex.join('|');
  str = str.replace( new RegExp( regexStr, 'g' ), function(matched){
    return map[matched];
  });
  return str;
}

export {
  doBuild
}