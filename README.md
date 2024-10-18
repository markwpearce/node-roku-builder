# Roku Builder (Node)

A node package to process a `.roku_builder_rebrand.json` file.

## Usage

Install package:

`npm install -D roku-builder`

Create `.roku_builder_rebrand.json` file:

```json
{
    "targets": ["components", "images", "source", "manifest"],
    "channel_config_sections": [],
    "resolutions": ["fhd"],
    "brands": {
        "core": {
            "replacements": {
                "##COPYRIGHT HEADER##": "*****  *****"
            },
            "manifest": {
                "title": "Roku App Name",
                "major_version": 1,
                "minor_version": 0,
                "build_version": "00001",
                "mm_icon_focus_fhd": "pkg:/images/channel-poster_fhd.jpg",
                "mm_icon_focus_hd": "pkg:/images/channel-poster_hd.jpg",
                "mm_icon_focus_sd": "pkg:/images/channel-poster_sd.jpg",
                "splash_screen_fhd": "pkg:/images/splash-screen_fhd.jpg",
                "splash_screen_hd": "pkg:/images/splash-screen_hd.jpg",
                "splash_screen_sd": "pkg:/images/splash-screen_sd.jpg",
                "uri_resolution_autosub": "$$RES$$,SD,720p,1080p",
                "ui_resolutions": "fhd",
                "environment": "production",
                "bs_libs_required": "roku_ads_lib,googleima3",
                "sg_component_libs_required": "Roku_Analytics",
                "supports_input_launch": 1,
                "confirm_partner_button": 1,
                "bs_const": {}
            }
        }
    }
}
```

Create script using `roku-builder`, eg: `./scripts/compileBrand.mjs`:

```ts
import * as builder from "roku-builder";

async function main(brand) {
    console.log(`Processing ${brand}`);
    await builder.doBuild({
        source: "./",
        target: "./dist",
        brand: brand,
        logLevel: "info",
    });
}

await main(process.argv[2]);
```

Run script to build:

`node ./scripts/compileBrand.mjs core`

This will build the final output for the app in `./brands/core` into `./dist`:

```
Processing core
[RokuBuilder] Config loaded ./
[RokuBuilder] Brand core requested
[RokuBuilder] Processing Brand "core" ...
[RokuBuilder] Process Brand "core" completed
[RokuBuilder] Finalizing Build...
[RokuBuilder] Build complete
```

## `.roku_builder_rebrand.json` Format

```jsonc
{
    "targets": [
        // a list of all the directories in each brand to process
    ],
    "channel_config_sections": [
        // a list of directories in region/*/config to process
    ],
    "resolutions": ["fhd"], // resolutions for image processing
    "brands": {
        // listing of all brands
        "core": {
            // example brand (eg. code at ./brands/core)
            "replacements": {
                // any replacements to do in any text file
                "##COPYRIGHT HEADER##": "*****  *****"
            },
            "manifest": {
                //Key-value pairs of the Manifest entries
                "title": "Core",
                "major_version": 1,
                "minor_version": 0,
                "build_version": "00001",
                "mm_icon_focus_fhd": "pkg:/images/channel-poster_fhd.jpg",
                "mm_icon_focus_hd": "pkg:/images/channel-poster_hd.jpg",
                "mm_icon_focus_sd": "pkg:/images/channel-poster_sd.jpg",
                "splash_screen_fhd": "pkg:/images/splash-screen_fhd.jpg",
                "splash_screen_hd": "pkg:/images/splash-screen_hd.jpg",
                "splash_screen_sd": "pkg:/images/splash-screen_sd.jpg",
                "uri_resolution_autosub": "$$RES$$,SD,720p,1080p",
                "ui_resolutions": "fhd",
                "environment": "production",
                "bs_libs_required": "roku_ads_lib,googleima3",
                "sg_component_libs_required": "Roku_Analytics",
                "supports_input_launch": 1,
                "confirm_partner_button": 1,
                "bs_const": {
                    "DEBUG": false,
                    "DEBUG_ANALYTICS": false,
                    "DEBUG_HTTPS": false,
                    "DEBUG_COLOR": false
                }
            },
            "parents": ["vendor"] // bring in any code from the vendor brand
        },
        "vendor": {
            // brand in ./brands/vendor
            "targets-override": ["components"] // only bring in files from ./brands/vendor/components
        },
        "!repeat_brands": {
            // a way to define multiple brands in a loop
            "for": ["alpha", "beta"],
            "replace": {
                // Define any additional replacements for this config
                "title": ["Alphagetti", "BetaFish"],
                "brand": ["alpha", "beta"]
            },
            "brands": {
                "{key}": {
                    // eg., this will define a brand named "alpha" and "beta"
                    "parents": ["core"],
                    "manifest": {
                        "title": "{title}", // the alpha brand will have title "Alphagetti"
                        "brand": "{brand}"
                    },
                    "replacements_files": [
                        "config/production.json"
                        // any other json files that define key-value pairs for text file replacements
                    ]
                },
                "{key}-staging": {
                    // define brands "alpha-staging" and "beta-staging"
                    "parents": ["{key}"], // start with "alpha" or "beta", and add extra details
                    "manifest": {
                        "title": "{title}-Staging",
                        "brand": "{brand}",
                        "environment": "staging",
                        "bs_const": {
                            "DEBUG": true
                        }
                    },
                    "replacements_files": ["config/staging.json"]
                }
            }
        }
    }
}
```
