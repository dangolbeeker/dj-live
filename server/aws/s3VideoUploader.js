const {spawn} = require('child_process');
const fs = require('fs');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const LOGGER = require('../../logger')('./server/aws/s3VideoUploader.js');

const S3_CLIENT = new S3Client({});

exports.uploadVideoToS3 = ({inputURL, Bucket, Key}) => {
    return new Promise((resolve, reject) => {
        const outputURL = inputURL.replace('.mp4', '-final.mp4');
        const args = [
            '-i', inputURL,
            '-c:a', 'copy',
            '-c:v', 'copy',
            '-movflags', 'faststart',
            outputURL
        ];

        const ffmpeg = spawn(process.env.FFMPEG_PATH, args);
        ffmpeg.stderr.on('data', data => {
            LOGGER.debug('stderr: {}', data)
        });
        ffmpeg.on('error', err => {
            LOGGER.error('An error occurred when adding moov atom to recorded stream {}: {}', inputURL, err);
            reject(err);
        });
        ffmpeg.on('close', async code => {
            LOGGER.debug('FFMPEG child process exited with code {}', code);
            if (code === 0) {
                LOGGER.debug('Uploading video file at {} to S3 (bucket: {}, key: {})', outputURL, Bucket, Key);

                const Body = fs.createReadStream(outputURL);
                Body.on('error', err => {
                    LOGGER.error('An error occurred when opening read stream at {}: {}', outputURL, err);
                    reject(err);
                });

                const upload = new Upload({
                    client: S3_CLIENT,
                    params: {Bucket, Key, Body}
                });

                upload.on('httpUploadProgress', progress => {
                    LOGGER.debug('Uploaded {} bytes of recorded stream to S3 (bucket: {}, key: {})',
                        progress.loaded, Bucket, Key);
                });

                try {
                    const result = await upload.done();
                    LOGGER.info('Successfully uploaded recorded stream to {}', decodeURIComponent(result.Location));
                    resolve({
                        originalFileURLs: [inputURL, outputURL],
                        video: {
                            bucket: Bucket,
                            key: Key
                        }
                    });
                } catch (err) {
                    LOGGER.error('An error occurred when uploading recorded stream to S3 (bucket: {}, key: {}): {}',
                        Bucket, Key, err);
                    reject(err);
                }
            }
        });
    });
}
