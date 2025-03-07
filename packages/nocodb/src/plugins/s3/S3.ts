import fs from 'fs';
import { promisify } from 'util';
import { GetObjectCommand, S3 as S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import axios from 'axios';
import { useAgent } from 'request-filtering-agent';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import type { IStorageAdapterV2, XcFile } from 'nc-plugin';
import type { Readable } from 'stream';
import { generateTempFilePath, waitForStreamClose } from '~/utils/pluginUtils';

export default class S3 implements IStorageAdapterV2 {
  private s3Client: S3Client;
  private input: any;

  constructor(input: any) {
    this.input = input;
  }

  get defaultParams() {
    return {
      ACL: 'private',
      Bucket: this.input.bucket,
    };
  }

  async fileCreate(key: string, file: XcFile): Promise<any> {
    // create file stream
    const fileStream = fs.createReadStream(file.path);
    // upload using stream
    return this.fileCreateByStream(key, fileStream);
  }

  async fileCreateByUrl(key: string, url: string): Promise<any> {
    const uploadParams: any = {
      ...this.defaultParams,
    };

    try {
      const response = await axios.get(url, {
        httpAgent: useAgent(url, { stopPortScanningByUrlRedirection: true }),
        httpsAgent: useAgent(url, { stopPortScanningByUrlRedirection: true }),
        responseType: 'stream',
      });

      uploadParams.Body = response.data;
      uploadParams.Key = key;
      uploadParams.ContentType = response.headers['content-type'];

      const data = await this.upload(uploadParams);
      return data;
    } catch (error) {
      throw error;
    }
  }

  fileCreateByStream(key: string, stream: Readable): Promise<void> {
    const uploadParams: any = {
      ...this.defaultParams,
    };
    return new Promise((resolve, reject) => {
      stream.on('error', (err) => {
        console.log('File Error', err);
        reject(err);
      });

      uploadParams.Body = stream;
      uploadParams.Key = key;

      // call S3 to upload file to specified bucket
      this.upload(uploadParams)
        .then((data) => {
          resolve(data);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  // TODO - implement
  fileReadByStream(_key: string): Promise<Readable> {
    return Promise.resolve(undefined);
  }

  // TODO - implement
  getDirectoryList(_path: string): Promise<string[]> {
    return Promise.resolve(undefined);
  }

  public async fileDelete(_path: string): Promise<any> {
    return Promise.resolve(undefined);
  }

  public async fileRead(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.s3Client.getObject({ Key: key } as any, (err, data) => {
        if (err) {
          return reject(err);
        }
        if (!data?.Body) {
          return reject(data);
        }
        return resolve(data.Body);
      });
    });
  }

  public async getSignedUrl(key, expiresInSeconds = 7200, filename?: string) {
    const command = new GetObjectCommand({
      Key: key,
      Bucket: this.input.bucket,
      ...(filename
        ? { ResponseContentDisposition: `attachment; filename="${filename}" ` }
        : {}),
    });
    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  public async init(): Promise<any> {
    // const s3Options: any = {
    //   params: {Bucket: process.env.NC_S3_BUCKET},
    //   region: process.env.NC_S3_REGION
    // };
    //
    // s3Options.accessKeyId = process.env.NC_S3_KEY;
    // s3Options.secretAccessKey = process.env.NC_S3_SECRET;

    const s3Options: S3ClientConfig = {
      region: this.input.region,
      credentials: {
        accessKeyId: this.input.access_key,
        secretAccessKey: this.input.access_secret,
      },
    };

    if (this.input.endpoint) {
      s3Options.endpoint = this.input.endpoint;
    }

    this.s3Client = new S3Client(s3Options);
  }

  public async test(): Promise<boolean> {
    try {
      const tempFile = generateTempFilePath();
      const createStream = fs.createWriteStream(tempFile);
      await waitForStreamClose(createStream);
      await this.fileCreate('nc-test-file.txt', {
        path: tempFile,
        mimetype: 'text/plain',
        originalname: 'temp.txt',
        size: '',
      });
      await promisify(fs.unlink)(tempFile);
      return true;
    } catch (e) {
      throw e;
    }
  }

  private async upload(uploadParams): Promise<any> {
    try {
      // call S3 to retrieve upload file to specified bucket
      const upload = new Upload({
        client: this.s3Client,
        params: { ...this.defaultParams, ...uploadParams },
      });

      const data = await upload.done();

      if (data) {
        const endpoint = this.input.endpoint
          ? new URL(this.input.endpoint).host
          : `s3.${this.input.region}.amazonaws.com`;
        return `https://${this.input.bucket}.${endpoint}/${uploadParams.Key}`;
      } else {
        throw new Error('Upload failed or no data returned.');
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
