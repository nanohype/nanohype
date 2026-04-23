package providers

import "errors"

// ErrUnknownProvider is returned by Get when no provider is registered
// under the requested name.
var ErrUnknownProvider = errors.New("auth: unknown provider")

// ErrProviderMisconfigured is returned by providers whose required
// environment configuration is missing or invalid. The middleware
// surfaces it during setup rather than at request time so misconfigured
// deployments fail fast.
var ErrProviderMisconfigured = errors.New("auth: provider misconfigured")
