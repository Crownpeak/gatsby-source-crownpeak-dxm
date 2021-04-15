const dotenv = require("dotenv");
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const subscription = require('./subscription');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let contentTypesOptions = [];

exports.createPages = async ({ graphql, actions, getNodesByType }) => {
    const { createPage } = actions;
    //console.time(`Creating pages`);
    contentTypesOptions.filter(ct => ct.template).forEach(ct => {
        const nodes = getNodesByType(ct.nodeType);
        //console.log(`Node type is ${ct.nodeType}, count is ${nodes.length}`);
        if (nodes && nodes.length) {
            nodes.filter(node => node.slug).forEach(node => {
                //console.log(`Creating page for ${node.slug}`);
                createPage({
                    path: node.slug,
                    component: ct.template,
                    context: {
                        slug: node.slug,
                        assetId: node.assetid,
                    },
                });
            });
        }
    });
    //console.timeEnd(`Creating pages`);
};

exports.sourceNodes = async (
        { actions, cache, createContentDigest, createNodeId, getNodesByType, getNodes },
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
    const collection = pluginOptions.collection || contentLocation.split("/")[3];
    console.log(`gatsby-source-crownpeak-dxm is using content location '${contentLocation}'`)

    const timestamp = await cache.get(`timestamp`);

    const { createNode, deleteNode, touchNode } = actions

    contentTypesOptions = processContentTypeOptions(pluginOptions.contentTypes);

    let contentTypes = contentTypesOptions.map(ct => ct.name);
    if (!contentTypes || !contentTypes.length) {
        // Get all available content types
        const typesUrl = `${contentLocation}&q=*:*&facet=true&facet.field=custom_s_type&facet.mincount=1&rows=0&echoParams=none&omitHeader=true&fq=${(pluginOptions.filterQueries || []).join("&fq=")}`;
        //console.log(`DEBUG: querying ${typesUrl}`);
        const types = (await (await fetch(typesUrl)).json()).facet_counts.facet_fields.custom_s_type;
        contentTypes = types.filter((_type, i) => i % 2 === 0);
        contentTypesOptions = processContentTypeOptions(contentTypes);
    }
    let cachedContent = [];
    // touch nodes to ensure they aren't garbage collected
    //console.time("Checking cached content");
    contentTypes.forEach(type => getNodesByType(getNodeTypeFromContentType(type)).forEach(node => { 
        // BUG: touchNode(node) should work here but is not stopping garbage collection
        //touchNode(node);
        // using delete node.internal.owner; createNode(node); seems to serve as a workaround
        delete node.internal.owner; 
        createNode(node); 
        //console.log(`Touched node ${node.assetid}, ${node.internal.type}`);
        cachedContent.push(node);
    }));
    //console.timeEnd("Checking cached content");
    //console.log(`Found cached content ${cachedContent.map(node => node.assetid)}`);

    if (cachedContent.length) {
        // Get a complete list of everything available
        //console.time("Getting existing content ids");
        const contentIds = await getExistingContent(contentLocation, pluginOptions, contentTypesOptions.map(type => type.name));
        //console.timeEnd("Getting existing content ids");
        //console.log(`Found existing content ${contentIds}`);

        // Clear down any cached content that no longer exists
        //console.time("Deleting old cached content");
        cachedContent.forEach(node => {
            const id = node.assetid;
            //console.log(`Looking for ${id} in ${contentIds}`);
            if (contentIds.indexOf(id) < 0) {
                //console.log(`Deleting old cached content ${id}`);
                deleteNode(node);
            }
        });
        //console.timeEnd("Deleting old cached content");
    }

    if (pluginOptions.previewMode) {
        const folder = pluginOptions.previewModeFolder || getContentFolder();
        console.log(`Subscribing to content updates from ${collection} [${folder}]`);
        subscription.subscribe({collection, folder, endpoint: pluginOptions.previewModeEndpoint, callback: async (data) => {
            //console.log(`Subscription callback with ${data}`);
            const key = Object.keys(data)[0];
            const content = data[key];
            switch (key) {
                case "delete":
                    //console.log(`Deleting node with asset id ${content.id}`);
                    getNodes().filter(n => n.assetid == content.id).forEach(n => {
                        // BUG: deleting a node does not delete the associated page, which can still be accessed using its slug
                        // See https://github.com/gatsbyjs/gatsby/issues/10844
                        //console.log(`Deleting node ${n.assetid}`);
                        deleteNode(n);
                    });
                    break;
                case "update":
                    // Wait a bit for the update to complete
                    await sleep(6000);
                    // And fall through
                case "add":
                default:
                    //console.log(`Adding/updating node with asset id ${content.id}`);
                    const url = `${contentLocation}&q=id:${content.id}&rows=1&fl=id,type:custom_s_type,slug:custom_s_slug,custom_t_json:[json]&echoParams=none&omitHeader=true&fq=${(pluginOptions.filterQueries || []).join("&fq=")}`;
                    let retryCounter = 10;
                    while (--retryCounter > 0) {
                        // We might have to wait for the record to arrive in the collection
                        //console.log(`DEBUG: querying ${url}`);
                        const response = await fetch(url);
                        const json = await response.json();

                        if (json.response.docs.length) {
                            const item = json.response.docs[0];
                            //console.log(`Creating node for asset id ${item.id}`);
                            createMyNode(item, getNodeTypeFromContentType(item.type), {createNode, createNodeId, createContentDigest});

                            // Short-cut out of the loop
                            break;
                        }
                        await sleep(1000);
                    }
                    if (retryCounter <= 0) {
                        console.warn(`Unable to find data for asset id ${content.id}`);
                    }
                    break;
            }
        }});
    }

    //console.time("Loading new and modified content");
    for (let i = 0, len = contentTypes.length; i < len; i++) {
        const type = contentTypes[i];
        const nodeType = getNodeTypeFromContentType(type);
        //console.log(`Found type ${type}`);

        let url = `${contentLocation}&q=custom_s_type:%22${type}%22&rows=10000&fl=id,slug:custom_s_slug,custom_t_json:[json]&echoParams=none&omitHeader=true&fq=${(pluginOptions.filterQueries || []).join("&fq=")}`;
        if (timestamp) {
            url += `&fq=custom_dt_published:[${new Date(timestamp).toISOString()}%20TO%20NOW]`;
        }
        //console.log(`DEBUG: querying ${url}`);
        const response = await fetch(url);
        const json = await response.json();
        
        json.response.docs.forEach(item => {
            createMyNode(item, nodeType, {createNode, createNodeId, createContentDigest});
        });
    };
    //console.timeEnd("Loading new and modified content");
    await cache.set(`timestamp`, Date.now());

    return;
}

const createMyNode = (item, nodeType, { createNode, createNodeId, createContentDigest }) => {
    const json = item.custom_t_json;
    //console.log(`Processing ${item.id}`);

    if (json.DropZones) {
        // Serialise dropzones so we can deserialise later without having to know every zone/field
        json.DropZones = JSON.stringify(json.DropZones);
    }

    //console.log(`Creating node with type ${nodeType}`);
    createNode({
        ...json,
        id: createNodeId(`${nodeType}-${item.id}`),
        assetid: item.id,
        parent: null,
        children: [],
        slug: item.slug,
        internal: {
            type: nodeType,
            content: JSON.stringify(json),
            contentDigest: createContentDigest(json),
        },
    });
};

const getExistingContent = async (contentLocation, pluginOptions, contentTypes) => {
    const types = contentTypes.map(t => `%22${t}%22`);
    const CHUNK_SIZE = 10000;
    let start = 0;
    let results = [];
    while (true) {
        const url = `${contentLocation}&q=custom_s_type:(${types.join("%20OR%20")})&rows=${CHUNK_SIZE}&start=${start}&fl=i:id&echoParams=none&omitHeader=true&fq=${(pluginOptions.filterQueries || []).join("&fq=")}`;
        //console.log(`Querying ${url}`);
        const response = (await (await fetch(url)).json()).response;
        if (!response || !response.numFound || !response.docs || !response.docs.length) break;
        results.push(response.docs.map(doc => doc.i));
        start += CHUNK_SIZE;
    }
    return [].concat(...results);
};

const getConfig = () => {
    const cwd = process.env.INIT_CWD || require('path').resolve('.');
    let config = process.env;
    // Merge in any environment changes they provided
    if (fs.existsSync(cwd + "/.env")) {
        Object.assign(config, dotenv.parse(fs.readFileSync(cwd + "/.env")))
    }
    return config;
}

const getContentFolder = () => {
    return getConfig().CMS_SITE_ROOT;
};

const getContentLocation = () => {
    return getConfig().CMS_DYNAMIC_CONTENT_LOCATION;
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
