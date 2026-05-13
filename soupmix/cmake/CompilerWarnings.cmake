function(soupmix_set_project_warnings target)
    set(_msvc_warnings
        /W4
        /permissive-
        /w14242 /w14254 /w14263 /w14265 /w14287 /we4289 /w14296
        /w14311 /w14545 /w14546 /w14547 /w14549 /w14555 /w14619 /w14640
        /w14826 /w14905 /w14906 /w14928
    )

    set(_clang_warnings
        -Wall -Wextra -Wpedantic
        -Wshadow -Wnon-virtual-dtor -Wold-style-cast -Wcast-align
        -Wunused -Woverloaded-virtual -Wconversion -Wsign-conversion
        -Wnull-dereference -Wdouble-promotion -Wformat=2
    )

    set(_gcc_warnings
        ${_clang_warnings}
        -Wmisleading-indentation
        -Wduplicated-cond -Wduplicated-branches
        -Wlogical-op -Wuseless-cast
    )

    if(MSVC)
        target_compile_options(${target} INTERFACE ${_msvc_warnings})
    elseif(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
        target_compile_options(${target} INTERFACE ${_clang_warnings})
    elseif(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
        target_compile_options(${target} INTERFACE ${_gcc_warnings})
    endif()
endfunction()
