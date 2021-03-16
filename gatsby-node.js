const dotenv = require("dotenv");
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

let contentTypesOptions = [];
let pages = [];

exports.createPages = async ({ graphql, actions }) => {
    const { createPage } = actions;
    //console.log(`Creating pages`);
    for (let page of pages) {
        //console.log(`Page is of type ${page.type}`);
        const contentType = contentTypesOptions.find(ct => ct.nodeType === page.type && ct.template);
        if (contentType && page.slug) {
            //console.log(`Creating page for ${page.slug}`);
            createPage({
                path: page.slug,
                component: contentType.template,
                context: {
                    slug: page.slug,
                    assetId: page.assetId,
                },
            });
        }
    }
};

exports.sourceNodes = async (
        { actions, createContentDigest, createNodeId, getNodesByType },
        pluginOptions
    ) => {
    let contentLocation = pluginOptions.contentLocation;
    if (!contentLocation) {
        if (pluginOptions.collection) {
            contentLocation = `//searchg2.crownpeak.net/${pluginOptions.collection}/select/?wt=json`;
        } else {
            contentLocation = getContentLocation();
        }
    }
    if (!contentLocation) {
        console.error(`You must specify a content location or collection.`);
        throw new Error(`You must specify a content location or collection.`);
    }
    if (contentLocation.slice(0, 2) === "//") contentLocation = "https:" + contentLocation;
    console.log(`gatsby-source-crownpeak-dxm is using content location '${contentLocation}'`)

    const { createNode } = actions

    contentTypesOptions = processContentTypeOptions(pluginOptions.contentTypes);

    let contentTypes = contentTypesOptions.map(ct => ct.name);
    if (!contentTypes || !contentTypes.length) {
        // Get all available content types
        const typesUrl = `${contentLocation}&q=*:*&facet=true&facet.field=custom_s_type&facet.mincount=1&rows=0&echoParams=none&fq=${(pluginOptions.filterQueries || []).join("&fq=")}`;
        //console.log(`DEBUG: querying ${typesUrl}`);
        const types = (await (await fetch(typesUrl)).json()).facet_counts.facet_fields.custom_s_type;
        contentTypes = types.filter((_type, i) => i % 2 === 0);
        contentTypesOptions = processContentTypeOptions(contentTypes);
    }

    // TODO: cache results and only query new data
    // See https://www.gatsbyjs.com/docs/creating-a-source-plugin/

    for (let i = 0, len = contentTypes.length; i < len; i++) {
        const type = contentTypes[i];
        const nodeType = getNodeTypeFromContentType(type);
        //console.log(`Found type ${type}`);

        const url = `${contentLocation}&q=custom_s_type:%22${type}%22&rows=1000&fl=id,custom_s_slug,custom_t_json:[json]&echoParams=none&fq=${(pluginOptions.filterQueries || []).join("&fq=")}`;
        //console.log(`DEBUG: querying ${url}`);
        const response = await fetch(url);
        const json = await response.json();
        
        json.response.docs.forEach(item => {
            const json = item.custom_t_json;
            //console.log(`Processing ${item.id}`);

            if (json.DropZones) {
                // Serialise dropzones so we can deserialise later without having to know every zone/field
                json.DropZones = JSON.stringify(json.DropZones);
            }

            //console.log(`Creating node with type ${nodeType}`);
            const slug = item.custom_s_slug;
            createNode({
                ...json,
                id: createNodeId(`${nodeType}-${item.id}`),
                assetid: item.id,
                parent: null,
                children: [],
                slug,
                internal: {
                    type: nodeType,
                    content: JSON.stringify(json),
                    contentDigest: createContentDigest(json),
                },
            });

            if (slug) {
                // These will be used in createPages above
                pages.push({
                    type: nodeType,
                    assetId: item.id,
                    slug,
                });
            }
        });
    };
    
    return;
}

const getContentLocation = () => {
    const cwd = process.env.INIT_CWD || require('path').resolve('.');
    let config = process.env;
    // Merge in any environment changes they provided
    if (fs.existsSync(cwd + "/.env")) {
        Object.assign(config, dotenv.parse(fs.readFileSync(cwd + "/.env")))
    }
    return config.CMS_DYNAMIC_CONTENT_LOCATION;
};

const getNodeTypeFromContentType = (contentType) => {
    // TODO: a better way to do this!
    if (!contentType || typeof contentType !== "string") return "";
    return contentType.replace(/\s/g, "");
};

const getTemplateNameFromNodeType = (nodeType) => {
    // TODO: a better way to do this!
    if (!nodeType || typeof nodeType !== "string") return "";
    return nodeType.substr(0, 1).toLowerCase() + nodeType.substr(1);
};

const getTemplatePath = ({template, nodeType}) => {
    const extensions = ["", ".js", ".jsx", ".ts", ".tsx"];
    if (!template) {
        // Derive the template name from the node type and see if it exists
        const templateName = getTemplateNameFromNodeType(nodeType);
        for (let ext of extensions) {
            const templatePath = path.resolve(`./src/templates/${templateName}${ext}`);
            if (fs.existsSync(templatePath)) return templatePath;
        }
    } else {
        if (template.indexOf("/") < 0) {
            // Look in the ./src/templates folder for this item
            for (let ext of extensions) {
                const templatePath = path.resolve(`./src/templates/${template}${ext}`);
                if (fs.existsSync(templatePath)) return templatePath;
            }
        } else {
            // They specified a path, so use it
            for (let ext of extensions) {
                const templatePath = path.resolve(`${template}${ext}`);
                if (fs.existsSync(templatePath)) return templatePath;
            }
        }
    }
    return "";
};

const processContentTypeOptions = (contentTypes) => {
    // Sanitise content types
    if (!contentTypes || !contentTypes.length) contentTypes = [];
    return contentTypes.map(ct => {
        if (typeof ct === "string") ct = {name: ct};
        if (!ct.nodeType) ct.nodeType = getNodeTypeFromContentType(ct.name);
        ct.template = getTemplatePath(ct);
        return ct;
    });
};

exports.onPreInit = () => console.log(`Loaded gatsby-source-crownpeak-dxm`)
