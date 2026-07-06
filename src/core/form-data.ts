import type { SdkImage } from "./types";

/**
 * Checks if a value is a React Native SdkImage file object.
 */
export function isSdkImage(value: unknown): value is SdkImage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.uri === "string" &&
    typeof obj.type === "string" &&
    typeof obj.name === "string"
  );
}

/**
 * Checks if a value is a Web File object (for browser environments).
 */
export function isWebFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

/**
 * Converts a plain object into a FormData object.
 * Correctly processes nested objects using bracket notation and handles File/SdkImage values.
 */
export function toFormData(data: Record<string, unknown>): FormData {
  const formData = new FormData();

  const appendValue = (key: string, value: unknown): void => {
    if (value === undefined || value === null) {
      return;
    }

    // Handle File objects in the browser
    if (isWebFile(value)) {
      formData.append(key, value);
      return;
    }

    // Handle SdkImage objects in React Native
    if (isSdkImage(value)) {
      // In React Native, FormData accepts a custom object with uri, type, and name.
      // Cast through unknown to Blob to satisfy standard TypeScript compiler types without using 'any'.
      formData.append(key, value as unknown as Blob);
      return;
    }

    // Handle Arrays
    if (Array.isArray(value)) {
      // Check if it's an array of files/images
      const isFileArray = value.some((item) => isWebFile(item) || isSdkImage(item));

      if (isFileArray) {
        value.forEach((item) => {
          if (isWebFile(item)) {
            formData.append(key, item);
          } else if (isSdkImage(item)) {
            formData.append(key, item as unknown as Blob);
          }
        });
      } else {
        // Fallback for non-file arrays: serialize to JSON
        formData.append(key, JSON.stringify(value));
      }
      return;
    }

    // Handle nested objects (recursive conversion to bracket notation)
    if (typeof value === "object" && !(value instanceof Date)) {
      const obj = value as Record<string, unknown>;
      Object.keys(obj).forEach((subKey) => {
        appendValue(`${key}[${subKey}]`, obj[subKey]);
      });
      return;
    }

    // Handle Date objects
    if (value instanceof Date) {
      formData.append(key, value.toISOString());
      return;
    }

    // Handle primitives (string, number, boolean)
    formData.append(key, String(value));
  };

  Object.keys(data).forEach((key) => {
    appendValue(key, data[key]);
  });

  return formData;
}
