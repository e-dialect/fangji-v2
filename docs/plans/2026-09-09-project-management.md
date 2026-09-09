# Issue 59: project management

Expose project details/settings directly from the dashboard and project heading. Split editing name/description from membership/access/quorum configuration, and retain the existing member, keyboard, ownership and delete operations. Preserve omitted fields in PATCH (DynamicModel defaults currently clear description during unrelated changes), reject explicitly empty/invalid names and invalid supplied settings, and validate permissions. Exercise real API persistence and Vue forms including failure/retry, Unicode values and independent changes.
