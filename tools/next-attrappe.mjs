export const unstable_cache = (fn) => fn;
export const revalidatePath = () => {};
export const revalidateTag = () => {};
export const cookies = async () => { throw new Error("cookies() lokal nicht verfügbar"); };
export const headers = async () => new Map();
