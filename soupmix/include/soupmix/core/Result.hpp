#pragma once

#include <string>
#include <utility>
#include <variant>

namespace soupmix::core {

enum class ErrorCode {
    Unknown,
    NotFound,
    InvalidArgument,
    InvalidState,
    Io,
    Parse,
    OutOfMemory,
    Unsupported,
};

struct Error {
    ErrorCode   code = ErrorCode::Unknown;
    std::string message;

    Error() = default;
    Error(ErrorCode c, std::string msg) : code(c), message(std::move(msg)) {}
};

template <typename T>
class Result {
public:
    Result(T value) : storage_(std::move(value)) {}
    Result(Error err) : storage_(std::move(err)) {}

    [[nodiscard]] bool         ok()    const noexcept { return storage_.index() == 0; }
    [[nodiscard]] explicit operator bool() const noexcept { return ok(); }

    [[nodiscard]] T&            value()       { return std::get<T>(storage_); }
    [[nodiscard]] const T&      value() const { return std::get<T>(storage_); }
    [[nodiscard]] const Error&  error() const { return std::get<Error>(storage_); }

private:
    std::variant<T, Error> storage_;
};

// Void specialization: success carries no value.
template <>
class Result<void> {
public:
    Result() = default;
    Result(Error err) : error_(std::move(err)), has_error_(true) {}

    [[nodiscard]] bool         ok()    const noexcept { return !has_error_; }
    [[nodiscard]] explicit operator bool() const noexcept { return ok(); }
    [[nodiscard]] const Error& error() const { return error_; }

private:
    Error error_{};
    bool  has_error_ = false;
};

inline Error err(ErrorCode code, std::string msg) { return Error{code, std::move(msg)}; }

} // namespace soupmix::core
