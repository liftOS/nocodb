import path from 'path';
import Url from 'url';
import { AppEvents } from 'nocodb-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import slash from 'slash';
import PQueue from 'p-queue';
import axios from 'axios';
import type { AttachmentReqType, FileType } from 'nocodb-sdk';
import type { NcRequest } from '~/interface/config';
import { AppHooksService } from '~/services/app-hooks/app-hooks.service';
import NcPluginMgrv2 from '~/helpers/NcPluginMgrv2';
import Local from '~/plugins/storage/Local';
import mimetypes, { mimeIcons } from '~/utils/mimeTypes';
import { PresignedUrl } from '~/models';
import { utf8ify } from '~/helpers/stringHelpers';
import { NcError } from '~/helpers/catchError';

@Injectable()
export class AttachmentsService {
  protected logger = new Logger(AttachmentsService.name);

  constructor(private readonly appHooksService: AppHooksService) {}

  async upload(param: { path?: string; files: FileType[]; req: NcRequest }) {
    // TODO: add getAjvValidatorMw
    const filePath = this.sanitizeUrlPath(
      param.path?.toString()?.split('/') || [''],
    );
    const destPath = path.join('nc', 'uploads', ...filePath);

    const storageAdapter = await NcPluginMgrv2.storageAdapter();

    // just in case we want to increase concurrency in future
    const queue = new PQueue({ concurrency: 1 });

    const attachments = [];
    const errors = [];

    if (!param.files?.length) {
      NcError.badRequest('No attachment provided!');
    }

    queue.addAll(
      param.files?.map((file) => async () => {
        try {
          const originalName = utf8ify(file.originalname);
          const fileName = `${path.parse(originalName).name}_${nanoid(
            5,
          )}${path.extname(originalName)}`;

          const url = await storageAdapter.fileCreate(
            slash(path.join(destPath, fileName)),
            file,
          );

          const attachment: {
            url?: string;
            path?: string;
            title: string;
            mimetype: string;
            size: number;
            icon?: string;
            signedPath?: string;
            signedUrl?: string;
          } = {
            ...(url ? { url } : {}),
            title: originalName,
            mimetype: file.mimetype,
            size: file.size,
            icon: mimeIcons[path.extname(originalName).slice(1)] || undefined,
          };

          // if `url` is null, then it is local attachment
          if (!url) {
            // then store the attachment path only
            // url will be constructed in `useAttachmentCell`
            attachment.path = path.join(
              'download',
              filePath.join('/'),
              fileName,
            );

            attachment.signedPath = await PresignedUrl.getSignedUrl({
              path: attachment.path.replace(/^download\//, ''),
            });
          } else {
            attachment.signedUrl = await PresignedUrl.getSignedUrl({
              path: decodeURI(new URL(attachment.url).pathname),
            });
          }

          attachments.push(attachment);
        } catch (e) {
          errors.push(e);
        }
      }),
    );

    await queue.onIdle();

    if (errors.length) {
      for (const error of errors) {
        this.logger.error(error);
      }
      throw errors[0];
    }

    this.appHooksService.emit(AppEvents.ATTACHMENT_UPLOAD, {
      type: 'file',
      req: param.req,
    });

    return attachments;
  }

  async uploadViaURL(param: {
    path?: string;
    urls: AttachmentReqType[];
    req: NcRequest;
  }) {
    const filePath = this.sanitizeUrlPath(
      param?.path?.toString()?.split('/') || [''],
    );
    const destPath = path.join('nc', 'uploads', ...filePath);

    const storageAdapter = await NcPluginMgrv2.storageAdapter();

    // just in case we want to increase concurrency in future
    const queue = new PQueue({ concurrency: 1 });

    const attachments = [];
    const errors = [];

    if (!param.urls?.length) {
      NcError.badRequest('No attachment provided!');
    }

    queue.addAll(
      param.urls?.map?.((urlMeta) => async () => {
        try {
          const { url, fileName: _fileName } = urlMeta;
          const response = await axios.head(url, { maxRedirects: 5 });
          const finalUrl = response.request.res.responseUrl || url;

          const parsedUrl = Url.parse(finalUrl, true);
          const decodedPath = decodeURIComponent(parsedUrl.pathname);
          const fileNameWithExt = _fileName || path.basename(decodedPath);

          const fileName = `${path.parse(fileNameWithExt).name}_${nanoid(
            5,
          )}${path.extname(fileNameWithExt)}`;

          const attachmentUrl = await storageAdapter.fileCreateByUrl(
            slash(path.join(destPath, fileName)),
            finalUrl,
          );
          // if `attachmentUrl` is null, then it is local attachment
          // then store the attachment path only
          // url will be constructed in `useAttachmentCell`
          const attachmentPath = !attachmentUrl
            ? `download/${filePath.join('/')}/${fileName}`
            : undefined;

          const mimeType = response.headers['content-type']?.split(';')[0];
          const size = response.headers['content-length'];

          attachments.push({
            ...(attachmentUrl ? { url: finalUrl } : {}),
            ...(attachmentPath ? { path: attachmentPath } : {}),
            title: fileNameWithExt,
            mimetype: mimeType || urlMeta.mimetype,
            size: size ? parseInt(size) : urlMeta.size,
            icon:
              mimeIcons[path.extname(fileNameWithExt).slice(1)] || undefined,
          });
        } catch (e) {
          errors.push(e);
        }
      }),
    );

    await queue.onIdle();

    if (errors.length) {
      errors.forEach((error) => this.logger.error(error));
      throw errors[0];
    }

    this.appHooksService.emit(AppEvents.ATTACHMENT_UPLOAD, {
      type: 'url',
      req: param.req,
    });

    return attachments;
  }

  async getFile(param: { path: string }): Promise<{
    path: string;
    type: string;
  }> {
    // get the local storage adapter to display local attachments
    const storageAdapter = new Local();
    const type =
      mimetypes[path.extname(param.path).split('/').pop().slice(1)] ||
      'text/plain';

    const filePath = storageAdapter.validateAndNormalisePath(
      slash(param.path),
      true,
    );
    return { path: filePath, type };
  }

  previewAvailable(mimetype: string) {
    const available = ['image', 'pdf', 'text/plain'];
    if (available.some((type) => mimetype.includes(type))) {
      return true;
    }
    return false;
  }

  sanitizeUrlPath(paths) {
    return paths.map((url) => url.replace(/[/.?#]+/g, '_'));
  }
}
