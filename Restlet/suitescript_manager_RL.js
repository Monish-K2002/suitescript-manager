/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @ScriptName : suitescript_manager_RL.js
 */

define(['N/log','N/file','N/encode','N/search','N/runtime'], function (log,file,encode,search,runtime) {

    class Utils{
        constructor(){

        }

        encoder(content){
            return encode.convert({
                string: content,
                outputEncoding: encode.Encoding.BASE_64,
                inputEncoding: encode.Encoding.UTF_8
            });
        }

        decoder(content){
            return encode.convert({
                string: content,
                outputEncoding: encode.Encoding.UTF_8,
                inputEncoding: encode.Encoding.BASE_64
            });
        }
    }

    class savedSearch{
        constructor(){
            this.fileName = ''
        }

        getFile(fileName){
            this.fileName = fileName;
            
            const searchObj = search.create({
                type: "file",
                filters:
                [
                    ["filetype","anyof","JAVASCRIPT"], 
                    "AND", 
                    ["name","is",this.fileName]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "Internal ID"})
                ]
            });

            let fileId = '';

            const fileCount = searchObj.runPaged().count;
            if(fileCount != 1){
                throw new Error("Either there are 0 or more than 1 files");
            }

            searchObj.run().each(result => {
                fileId = result.id
            })

            return file.load({
                id: fileId
            });
        }

        getSearchList(){
            const searchObj = search.create({
                type: "savedsearch",
                filters:
                [
                ],
                columns:
                [
                    search.createColumn({name: "title", label: "Title"}),
                    search.createColumn({name: "recordtype", label: "Type"})
                ]
            });

            const count = searchObj.runPaged().count;
            
            if(count == 0){
                throw new Error("No saved searches found");
            }
            
            const pagedData = searchObj.runPaged({
                pageSize: 1000
            });

            const resultData = [];

            pagedData.pageRanges.forEach((pageRange) => {
                const page = pagedData.fetch({ index: pageRange.index });

                page.data.forEach((result) => {
                    const row = {
                        id: result.id,
                        title: result.getValue('title'),
                        recordType: result.getValue('recordtype')
                    };

                    resultData.push(row);
                });
            });

            return resultData;
        }

        previewSearch(searchId){
            const searchObj = search.load({
                id: searchId
            });

            const columns = searchObj.columns.map(col => {
                const obj = {
                    name: col.name,
                    label: col.label || col.name,
                }
                if(col.join){
                    obj.join = col.join
                }
                if(col.summary){
                    obj.summary = col.summary
                }
                if(col.formula){
                    obj.formula = col.formula
                }
                return obj
            });

            log.debug('columns',columns)

            
            const paged = searchObj.runPaged({ pageSize: 50 });
            const page = paged.fetch({ index: 0 });

            const rows = page.data.map(result => {
                const row = {};
                columns.forEach(col => {
                    row[col.label] = result.getText(col) || result.getValue(col);
                });
                return row;
            });

            log.debug('rows',rows)

            return {
                status: 'success',
                searchId: searchId,
                columns: columns,
                rows: rows
            }
        }

        getFileId(fileName){
            this.fileName = fileName;
            
            const searchObj = search.create({
                type: "file",
                filters:
                [
                    ["filetype","anyof","JAVASCRIPT"], 
                    "AND", 
                    ["name","is",this.fileName]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "Internal ID"})
                ]
            });

            let fileId = '';
            let scriptId = '';

            const fileCount = searchObj.runPaged().count;
            if(fileCount != 1){
                throw new Error("Either there are 0 or more than 1 files");
            }

            searchObj.run().each(result => {
                fileId = result.id
            })

            if(!fileId){
                throw new Error("File not found");
            }

            const scriptSearchObj = search.create({
                type: "script",
                filters:
                [
                    ["scriptfile","anyof",fileId]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "Internal ID"})
                ]
            });

            const scriptCount = searchObj.runPaged().count;
            if(scriptCount != 1){
                throw new Error("Either there are 0 or more than 1 scripts");
            }

            scriptSearchObj.run().each(result => {
                scriptId = result.id
            })

            if(!scriptId && fileId){
                return {id: fileId, type: 'file'}
            }
            else if(!scriptId && !fileId){
                throw new Error("File not found");
            }

            return {id: scriptId, type: 'script'};
        }

        getRecentLogs(fileName){
            this.fileName = fileName;
            
            const searchObj = search.create({
                type: "file",
                filters:
                [
                    ["filetype","anyof","JAVASCRIPT"], 
                    "AND", 
                    ["name","is",this.fileName]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "Internal ID"})
                ]
            });

            let fileId = '';
            let scriptId = '';

            const fileCount = searchObj.runPaged().count;
            if(fileCount != 1){
                throw new Error("Either there are 0 or more than 1 files");
            }

            searchObj.run().each(result => {
                fileId = result.id
            })

            if(!fileId){
                throw new Error("File not found");
            }

            const scriptLogSearchObj = search.create({
                type: "scriptexecutionlog",
                filters:
                [
                    ["script.scriptfile","anyof",fileId]
                ],
                columns:
                [
                    search.createColumn({name: "title", label: "title"}),
                    search.createColumn({name: "type", label: "type"}),
                    search.createColumn({name: "date", label: "date"}),
                    search.createColumn({name: "time", label: "time"}),
                    search.createColumn({name: "user", label: "user"}),
                    search.createColumn({name: "scripttype", label: "scriptType"}),
                    search.createColumn({name: "detail", label: "details"}),
                    search.createColumn({name: "internalid", label: "Internal ID", sort: search.Sort.DESC})
                ]
            });
            
            const pagedData = scriptLogSearchObj.runPaged({ pageSize: 100 });
            const page = pagedData.fetch({ index: 0 });
            
            const logs = page.data.map(result => {
                const row = {};
                scriptLogSearchObj.columns.forEach(col => {
                    row[col.label] = result.getText(col) || result.getValue(col);
                });
                return row;
            });
            
            return logs;
        }
    }

    /**
     * Handles GET requests.
     *
     * @param {Object} requestParams
     * @returns {Object}
     */
    const get = (requestParams) => {
        try {
            log.debug('GET requestParams',requestParams)
            const fileName = requestParams.fileName;
            const action = requestParams.action;
            const searchId = requestParams.searchId;
            log.debug('GET action',action)
            log.debug('GET fileName',fileName)
            log.debug('GET searchId',searchId)
            if(action == 'getScriptContents'){
                return getScriptContents(fileName)
            }
            if(action == 'getSearchList'){
                return getSearchList()
            }
            if(action == 'previewSearch'){
                return previewSearch(searchId)
            }
            if(action == 'getScriptId'){
                return getScriptId(fileName)
            }
            if(action == 'fetchRecentLogs'){
                return fetchRecentLogs(fileName)
            }
        } catch (error) {
            log.error('error in GET', error);
            return {
                status: 'error',
                message: error.message
            };
        }
    };

    function getScriptContents(fileName){
        log.debug('GET fileName',fileName)
        const searchClass = new savedSearch();
        const existingFile = searchClass.getFile(fileName);

        const contents = existingFile.getContents();

        const utils = new Utils()
        const encodedContent = utils.encoder(contents);
        return {
            status: 'success',
            contents: encodedContent
        };
    }

    function getSearchList(){
        const searchClass = new savedSearch();
        const list = searchClass.getSearchList()
        return {
            status: 'success',
            list: list
        };
    }

    function previewSearch(searchId){
        const searchClass = new savedSearch();
        const resultData = searchClass.previewSearch(searchId)
        return resultData
    }

    function getScriptId(fileName){
        const searchClass = new savedSearch();
        const scriptIdObj = searchClass.getFileId(fileName)
        return {
            status: 'success',
            scriptId: scriptIdObj.id,
            accountId: runtime.accountId,
            type: scriptIdObj.type
        }
    }

    function fetchRecentLogs(fileName){
        const searchClass = new savedSearch();
        const logData = searchClass.getRecentLogs(fileName)
        
        return {
            status: 'success',
            logs: logData
        };
    }

    /**
     * Handles POST requests.
     *
     * @param {Object} requestBody
     * @returns {Object}
     */
    const post = (requestBody) => {
        try {
            const fileName = requestBody.fileName;
            const utils = new Utils();

            const searchClass = new savedSearch();
            const existingFile = searchClass.getFile(fileName);
            const oldContent = existingFile.getContents();

            const decoded = utils.decoder(requestBody.message);

            log.debug('Decoded Code', decoded);

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
                message: 'File successfully updated',
                oldContent: utils.encoder(oldContent)
            };
        } catch (error) {
            log.error('error in POST', error);
            return {
                status: 'error',
                message: error
            };
        }
    };

    return { get, post };
});