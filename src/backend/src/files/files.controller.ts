import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { Auth } from '../auth/decorators';
import { ValidRoles } from '../auth/interfaces';
import { FilesService } from './files.service';
import { diskStorage } from 'multer';
import { fileNamer, fileFilter } from './helpers';
import { Response } from 'express';

@ApiTags('Files - Get and Upload')
@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly configService: ConfigService,
  ) {}

  @Get('product/:imageName')
  @ApiResponse({
    status: 200,
    description: 'File was found',
  })
  @ApiResponse({
    status: 404,
    description: 'Not found',
  })
  findProductImage(
    @Res() res: Response,
    @Param('imageName') imageName: string,
  ) {
    const { root, fileName } =
      this.filesService.getStaticProductImage(imageName);

    res.sendFile(fileName, { root });
  }

  @Post('product')
  @Auth(ValidRoles.admin)
  @ApiResponse({
    status: 201,
    description: 'Image was uploaded',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'The user is not an admin or the CSRF token is missing',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: fileFilter,
      storage: diskStorage({
        destination: './static/products',
        filename: fileNamer,
      }),
    }),
  )
  uploadProductImage(
    // can be done with ParseFilePipeBuilder or with the fileFilter
    // new ParseFilePipeBuilder()
    //   .addFileTypeValidator({
    //     fileType: /(jpg|jpeg|png|gif|bmp|webp|tiff|svg|ico)$/,
    //   })
    //   .build({
    //     errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    //   }),
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Make sure that the file is an image');
    }

    const secureUrl = `${this.configService.get('HOST_API')}/files/product/${file.filename}`;

    return { secureUrl, fileName: file.filename };
  }
}
