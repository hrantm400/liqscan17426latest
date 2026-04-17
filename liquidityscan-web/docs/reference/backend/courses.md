# Courses module

## `CoursesService`
**File:** [`backend/src/courses/courses.service.ts`](../../../backend/src/courses/courses.service.ts)  

**Purpose:** CRUD for `Course`, nested `Chapter`, `Lesson`; access checks against user subscription / chapter subscriptions.

## `CoursesController`
**File:** [`backend/src/courses/courses.controller.ts`](../../../backend/src/courses/courses.controller.ts)  

**Purpose:** Public catalog routes and authenticated lesson playback; admin may use separate paths — verify decorators in source.

## DTOs
- [`create-course.dto.ts`](../../../backend/src/courses/dto/create-course.dto.ts) — validation for course creation.
