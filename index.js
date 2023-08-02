const { default: axios } = require("axios")
const { existsSync, mkdirSync, openSync, createWriteStream, readFileSync, writeFileSync } = require("fs")
const { dirname } = require("path")
const { SourceMapConsumer } = require("source-map")
const { parse } = require("url")

const targetUrl = process.argv[2]
const targetDir = process.argv[3] || 'extract'
const matcher = /\s(?:src|href)=['"]([-a-zA-Z0-9()@:%_\+.~#?&\/=]+)['"][\s>]/g
const parts = parse(targetUrl)

const tm = setTimeout(() => {
    console.warn('SELF KILLING')
    process.exit(1)
}, 3000)



axios.get(targetUrl).catch(
    e => {
        console.warn(e.message)
        return Promise.resolve(e.response)
    }
).then(
    async ({ data }) => {
        /** @type {string} */
        let path, fname, url, tag
        let match;
        const mappings = Object.create(null)
        const downloadDir = `${targetDir}/.download`
        mkdirSync(downloadDir, { recursive: true })

        while ((match = matcher.exec(data))) {

            path = match[1]
            // only grab relative path
            if (path.match(/^(https?|:?\/\/)/)) {
                console.warn('(!) SKIP:', path)
                continue
            }

            url = `${parts.protocol}//${parts.host}${path}.map`
            fname = `${downloadDir}/${path.replace(/[^\w]/g, '_')}.map`

            if (existsSync(fname)) {
                mappings[fname] = url
                console.warn('(!) EXIST:', url, '\n\tAS', fname)
                continue
            }
            tag = `GET ${url}`
            console.time(tag)
            //console.timeLog(tag, '', url, '\n\tTO', fname)
            await axios.get(url, {
                responseType: 'stream'
            }).then(({ data }) => new Promise((resolve, reject) => {
                const stream = createWriteStream(fname)
                data.pipe(stream);
                let error = null;
                stream.on('error', err => {
                    error = err;
                    stream.close();
                    reject(err);
                });
                stream.on('close', () => {
                    if (!error) {
                        mappings[fname] = url
                        resolve(true);
                    }
                    //no need to call the reject here, as it will have been called in the
                    //'error' stream;
                });
            })).catch(
                e => {
                    console.warn(e.message)
                }
            ).finally(
                () => console.timeEnd(tag)
            )
        }

        return mappings

    }
).then(
    async (mappings) => {
        let json, srcFile, content
        for (let fname in mappings) {
            try {
                json = JSON.parse(readFileSync(fname, 'utf-8'))
            } catch (error) {
                console.warn(error.message)
            }
            await SourceMapConsumer.with(json, mappings[json], async c => {
                for (let src of c.sources) {
                    srcFile = `${targetDir}/${src.replace(/^\w+:\/\//, '')}`

                    if (existsSync(srcFile)) {
                        console.warn(`Exist:`, srcFile)
                        continue
                    }

                    mkdirSync(dirname(srcFile), { recursive: true })

                    console.log('Extracting\n', srcFile)
                    content = c.sourceContentFor(src)
                    if (content) {
                        writeFileSync(srcFile, content)
                    } else {
                        console.log('EMPTY\n', srcFile)
                    }
                }
            })
        }
    }
).catch(e => console.error(e.message, e.stack))
    .finally(
        () => {
            clearTimeout(tm)
            console.log('DONE')
        }
    )
