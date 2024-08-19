export interface Dictionary<Type> {
  [key: string]: Type;
}

export interface rokuBuilderFileInfo {
  relativeFilePath: string;
  absoluteFilePath: string;
}

export interface Options {
  source: string
  target: string
  brand: string | undefined
}

declare async function doBuild(options: Options): Promise<void>;