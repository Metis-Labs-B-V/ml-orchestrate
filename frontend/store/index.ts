import { configureStore } from "@reduxjs/toolkit";

import activityLogsReducer from "./slices/activityLogsSlice";
import clientUsersReducer from "./slices/clientUsersSlice";
import clientFormReducer from "./slices/clientFormSlice";
import customersListReducer from "./slices/customersListSlice";
import customersNewReducer from "./slices/customersNewSlice";
import forgotPasswordReducer from "./slices/forgotPasswordSlice";
import i18nReducer from "./slices/i18nSlice";
import impersonationLogsReducer from "./slices/impersonationLogsSlice";
import loginReducer from "./slices/loginSlice";
import resetPasswordReducer from "./slices/resetPasswordSlice";
import rolesReducer from "./slices/rolesSlice";
import sessionReducer from "./slices/sessionSlice";
import settingsReducer from "./slices/settingsSlice";
import signupReducer from "./slices/signupSlice";
import ssoReducer from "./slices/ssoSlice";
import tenantsListReducer from "./slices/tenantsListSlice";
import tenantsNewReducer from "./slices/tenantsNewSlice";
import userCreateReducer from "./slices/userCreateSlice";
import userEditReducer from "./slices/userEditSlice";
import usersListReducer from "./slices/usersListSlice";
import myUsersReducer from "./slices/myUsersSlice";
import verifyEmailReducer from "./slices/verifyEmailSlice";
import snackbarReducer from "./slices/snackbarSlice";

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    i18n: i18nReducer,
    login: loginReducer,
    signup: signupReducer,
    forgotPassword: forgotPasswordReducer,
    resetPassword: resetPasswordReducer,
    sso: ssoReducer,
    snackbar: snackbarReducer,
    verifyEmail: verifyEmailReducer,
    tenantsList: tenantsListReducer,
    tenantsNew: tenantsNewReducer,
    customersList: customersListReducer,
    customersNew: customersNewReducer,
    clientForm: clientFormReducer,
    clientUsers: clientUsersReducer,
    usersList: usersListReducer,
    userCreate: userCreateReducer,
    userEdit: userEditReducer,
    myUsers: myUsersReducer,
    roles: rolesReducer,
    settings: settingsReducer,
    activityLogs: activityLogsReducer,
    impersonationLogs: impersonationLogsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
