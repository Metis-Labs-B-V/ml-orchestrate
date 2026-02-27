import axios from "axios";

import { store } from "../store";
import { showError } from "../store/slices/snackbarSlice";

const axiosClient = axios.create();

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.detail ||
      error?.message ||
      "Request failed";

    try {
      store.dispatch(showError(message));
    } catch {
      // avoid crashing in non-browser contexts
    }

    return Promise.reject(error);
  }
);

export default axiosClient;

