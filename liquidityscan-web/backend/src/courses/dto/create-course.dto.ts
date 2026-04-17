import { IsString, IsOptional, IsNumber, IsNotEmpty, IsArray, IsIn } from 'class-validator';

export const COURSE_DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'] as const;

export class CreateCourseDto {
    @IsString()
    @IsNotEmpty()
    title: string;
    
    @IsString()
    @IsOptional()
    description?: string;
    
    @IsString()
    @IsOptional()
    coverUrl?: string;

    @IsString()
    @IsOptional()
    @IsIn(COURSE_DIFFICULTIES)
    difficulty?: string;

    @IsNumber()
    @IsOptional()
    price?: number;

    @IsString()
    @IsOptional()
    subscriptionId?: string;
}

export class UpdateCourseDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    coverUrl?: string;

    @IsString()
    @IsOptional()
    @IsIn(COURSE_DIFFICULTIES)
    difficulty?: string;
}

export class CreateChapterDto {
    @IsString()
    @IsNotEmpty()
    title: string;
    
    @IsString()
    @IsOptional()
    description?: string;
    
    @IsString()
    @IsOptional()
    coverUrl?: string;
    
    @IsString()
    @IsOptional()
    videoUrl?: string;
    
    @IsString()
    @IsNotEmpty()
    difficulty: string;
    
    @IsNumber()
    price: number;
    
    isFree: boolean;
    
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    subscriptionIds?: string[];
    
    @IsNumber()
    order: number;
}

export class CreateLessonDto {
    @IsString()
    @IsNotEmpty()
    title: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsNotEmpty()
    videoUrl: string;

    @IsString()
    @IsOptional()
    videoProvider?: string;

    @IsString()
    @IsOptional()
    coverUrl?: string;

    @IsNumber()
    @IsOptional()
    order?: number;
}

export class UpdateLessonDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    videoUrl?: string;

    @IsString()
    @IsOptional()
    videoProvider?: string;

    @IsString()
    @IsOptional()
    coverUrl?: string;

    @IsNumber()
    @IsOptional()
    order?: number;
}
