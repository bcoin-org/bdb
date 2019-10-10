// Copyright 2017 The LevelDB Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file. See the AUTHORS file for names of contributors.

#ifndef STORAGE_LEVELDB_PORT_PORT_CONFIG_H_
#define STORAGE_LEVELDB_PORT_PORT_CONFIG_H_

// Check for fdatasync() in <unistd.h>.
#if !defined(HAVE_FDATASYNC)
#if __has_include (<unistd.h>)
  #include <unistd.h>
  #if defined(fdatasync)
    #define HAVE_FDATASYNC 1
  #else
    #define HAVE_FDATASYNC 0
  #endif
#else
  #define HAVE_FDATASYNC 0
#endif
#endif  // !defined(HAVE_FDATASYNC)

// Check for F_FULLFSYNC in <fcntl.h>.
#if !defined(HAVE_FULLFSYNC)
#if __has_include (<fcntl.h>)
  #include <fcntl.h>
  #if defined(F_FULLFSYNC)
    #define HAVE_FULLFSYNC 1
  #else
    #define HAVE_FULLFSYNC 0
  #endif
#else
  #define HAVE_FULLFSYNC 0
#endif
#endif  // !defined(HAVE_FULLFSYNC)

// Check CRC32C.
#if !defined(HAVE_CRC32C)
  #define HAVE_CRC32C 0
#endif  // !defined(HAVE_CRC32C)

// Check Snappy.
#if !defined(HAVE_SNAPPY)
  #define HAVE_SNAPPY 1
#endif  // !defined(HAVE_SNAPPY)

// Check Endianness.
#if !defined(LEVELDB_IS_BIG_ENDIAN)
#if defined(OS_MACOSX) || defined(OS_IOS)
  #include <machine/endian.h>
#if defined(__DARWIN_BIG_ENDIAN) && defined(__DARWIN_BYTE_ORDER)
    #define LEVELDB_IS_BIG_ENDIAN \
(__DARWIN_BYTE_ORDER == __DARWIN_BIG_ENDIAN)
  #endif
#elif defined(OS_SOLARIS)
  #include <sys/isa_defs.h>
  #ifdef _BIG_ENDIAN
    #define LEVELDB_IS_BIG_ENDIAN true
  #else
    #define LEVELDB_IS_BIG_ENDIAN false
  #endif
#elif defined(OS_FREEBSD) || defined(OS_OPENBSD) ||\
  defined(OS_NETBSD) || defined(OS_DRAGONFLYBSD)
  #include <sys/types.h>
  #include <sys/endian.h>
#define LEVELDB_IS_BIG_ENDIAN (_BYTE_ORDER == _BIG_ENDIAN)
#elif defined(OS_HPUX)
  #define LEVELDB_IS_BIG_ENDIAN true
#elif defined(OS_ANDROID)
// Due to a bug in the NDK x86 <sys/endian.h> definition,
// _BYTE_ORDER must be used instead of __BYTE_ORDER on Android.
// See http://code.google.com/p/android/issues/detail?id=39824
  #include <endian.h>
#define LEVELDB_IS_BIG_ENDIAN  (_BYTE_ORDER == _BIG_ENDIAN)
#else
  #include <endian.h>
#define LEVELDB_IS_BIG_ENDIAN (__BYTE_ORDER == __BIG_ENDIAN)
#endif

#endif  // !defined(LEVELDB_IS_BIG_ENDIAN)

#endif  // STORAGE_LEVELDB_PORT_PORT_CONFIG_H_
