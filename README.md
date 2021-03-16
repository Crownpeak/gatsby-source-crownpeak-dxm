<a href="https://www.crownpeak.com" target="_blank">![Crownpeak Logo](https://github.com/Crownpeak/DXM-React-SDK/raw/master/images/crownpeak-logo.png?raw=true "Crownpeak Logo")</a>

# Crownpeak Digital Experience Management (DXM) Gatsby Source Plugin
Crownpeak Digital Experience Management (DXM) Gatsby Source Plugin has been constructed to assist
the Single Page App developer in developing applications served by Gatsby that leverage DXM for content management purposes.

---

## Benefits

As an application is built in Gatsby, it collects information about pages, components, and their underlying
data in order to perform server-side rendering. To facilitate this process for content contained within DXM,
a runtime NPM Package is provided. The purpose of this package is:

* Read application configuration detail from a global environment file (e.g., Dynamic Content API endpoint and credentials, etc.);
* Making data models available to the Gatsby Application, which a developer can map against
    * **Dynamic Data** - Processing data from the DXM Dynamic Content API, using the Search G2 Raw JSON endpoint.
  
## Install
```
yarn add gatsby-source-crownpeak-dxm
# or 
npm install gatsby-source-crownpeak-dxm
```

## Configuration
Create a `gatsby-config.js` file in the root of your application. The behaviour of the Crownpeak Digital 
Experience Management (DXM) Gatsby Source Plugin can be controlled via the options provided to it:
```javascript
// In your gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: `gatsby-source-crownpeak-dxm`,
      options: {
        // Optionally provide the Search G2 collection name
        collection: "your-collection-name",
        // Or, instead, provide a location where Search G2 can be queried
        contentLocation: "//searchg2.crownpeak.net/your-collection-name/select/?wt=json",
        // If neither option above is specified, the value in CMS_DYNAMIC_CONTENT_LOCATION in .env will be used

        // Provide zero or more filter queries that will be applied to all queries
        filterQueries: ["custom_is_cms_folder_id:12345"],

        // contentTypes is optional, and will be queried from Search G2 if not provided
        // if contentTypes is not specified, /src/templates will be checked for a matching template for each type
        // e.g. if the CMS content type is "Blog Page", /src/template/blogPage.js will be searched
        // Similarly if a template value is not provided in contentTypes, the folder will be searched
        contentTypes: [{name: "Blog Page", template: "blog-template.js"}, "Content Page"]
      },
    },
  ],
}
```
See <a href="https://github.com/Crownpeak/DXM-SDK-Examples/tree/master/React" target="_blank">https://github.com/Crownpeak/DXM-SDK-Examples/tree/master/React</a>
for information on how to populate a `.env` file and scaffold DXM code and configuration from your application.

## Usage

### Content Types
When the Crownpeak Digital Experience Management (DXM) Gatsby Source Plugin runs, it first determines which content
types it is looking for. If no configuration is found, it queries the Search G2 data source for all available 
content types. The content types are determined by unique values in the `custom_s_type` field.

For each configured or discovered content type, JSON data will be retrieved from the `custom_t_json` field and stored in the graphql data set on a node which is named based on the content type with spaces removed. For example a content type of `Blog Page` will result in graphql nodes `allBlogPage` and `blogPage`.

In addition to the content from `custom_t_json`, all items will have an `assetid` field populated with the appropriate DXM asset's branch id. If the data contains a `custom_s_slug` field, a `slug` field will be provided, populated with that content.

### Page Creation

In the page creation phase, any content with a populated `slug` field will examined. If a template is provided in the `contentType` options, that will be used. Otherwise the application is searched for a template file to match the content type. For example, if the content type is `Blog Page`, the search will be for `/src/templates/blogPage.js`. If a suitable template is located, `createPage` will be called for this content and slug. The template will be passed the appropriate DXM asset id in the page context object's `assetId` parameter.

If you are using the <a href="https://github.com/Crownpeak/DXM-SDK-Examples/tree/master/React" target="_blank">Crownpeak Digital Experience Management (DXM) Software Development Kit (SDK) for React</a>, you can pass data that you load via graphql to components and fields using the following code:

```javascript
const MyPage = ({ data, pageContext }) => {
  // CmsPage
  CmsDataCache.cmsAssetId = pageContext.assetId;
  CmsDataCache.set(CmsDataCache.cmsAssetId, data.myPage); // Use the applicable node name here
  return ( <div>etc.</div> )
};
```
Note that the `CmsPage` comment is required for the page parser to discover your template script during the scaffolding process.

### DropZones
If you are using the <a href="https://github.com/Crownpeak/DXM-SDK-Examples/tree/master/React" target="_blank">Crownpeak Digital Experience Management (DXM) Software Development Kit (SDK) for React</a>, content from any drop zones contained on a page is automatically serialised to a string. This is done so that it is not necessary to query the exact arrangement of nodes, since this cannot be known at build time.

In your graphql query, simply add the `DropZones` node, and its contents will be automatically deserialised before use.

---
## Credit
Thanks to:
* <a href="https://github.com/richard-lund" target="_blank">Richard Lund</a> for the work;
* <a href="https://github.com/ptylr" target="_blank">Paul Taylor</a> for a few edits ;)


## Version History
 
| Version       | Date          | Changes                            |
| ------------- | --------------|----------------------------------- |
| 1.0.0         | 2021MAR15     | Initial Release.                   |
| 1.1.0         | 2021MAR16     | Add support for incremental builds, bug fix. |

 
## License
MIT License

Copyright (c) 2021 Crownpeak Technology, inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
