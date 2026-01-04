/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @ScriptName : suitescript_manager_RL.js
 */

define(['N/log','N/file','N/encode','N/search'], function (log,file,encode,search) {

    /**
     * Handles GET requests.
     *
     * @param {Object} requestParams
     * @returns {Object}
     */
    const get = (requestParams) => {
        try {
            const fileName = requestParams.fileName;
            log.debug('GET fileName',fileName)
            const searchObj = search.create({
                type: "file",
                filters:
                [
                    ["filetype","anyof","JAVASCRIPT"], 
                    "AND", 
                    ["name","is",fileName]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "Internal ID"})
                ]
            });

            let fileId = '';

            const fileCount = searchObj.runPaged().count;
            if(fileCount != 1){
                return {
                    status: "error",
                    message: "Either there are 0 or more than 1 files"
                }
            }

            searchObj.run().each(result => {
                fileId = result.id
            })

            const existingFile = file.load({
                id: fileId
            })

            const contents = existingFile.getContents();

            const encodedContent = encode.convert({
                string: contents,
                outputEncoding: encode.Encoding.BASE_64,
                inputEncoding: encode.Encoding.UTF_8
            });
            return {
                status: 'success',
                contents: encodedContent
            };
        } catch (error) {
            log.error('error in GET', error);
            throw error;
        }
    };

    /**
     * Handles POST requests.
     *
     * @param {Object} requestBody
     * @returns {Object}
     */
    const post = (requestBody) => {
        try {
            const fileName = requestBody.fileName;

            const searchObj = search.create({
                type: "file",
                filters:
                [
                    ["filetype","anyof","JAVASCRIPT"], 
                    "AND", 
                    ["name","is",fileName]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "Internal ID"})
                ]
            });

            let fileId = '';

            const fileCount = searchObj.runPaged().count;
            if(fileCount != 1){
                return {
                    status: "error",
                    message: "Either there are 0 or more than 1 files"
                }
            }

            searchObj.run().each(result => {
                fileId = result.id
            })

            const decoded = encode.convert({
                string: requestBody.message,
                inputEncoding: encode.Encoding.BASE_64,
                outputEncoding: encode.Encoding.UTF_8
            });

            log.debug('Decoded Code', decoded);

            const existingFile = file.load({
                id: fileId
            })
            var fileObj = file.create({
                name: existingFile.name,
                fileType: existingFile.fileType,
                contents: decoded,
                description: existingFile.description,
                encoding: existingFile.encoding,
                folder: existingFile.folder,
                isOnline: existingFile.isOnline
            });
            fileObj.save();
            return {
                status: 'success',
                message: 'File successfully updated'
            };
        } catch (error) {
            log.error('error in POST', error);
        }
    };

    return { get, post };
});